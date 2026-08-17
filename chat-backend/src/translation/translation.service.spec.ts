import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { TranslationService, buildTranslateKey3 } from './translation.service';
import { TranslateRateLimitGuard } from './translate-throttler.guard';
import { RedisService } from '../common/redis/redis.service';
import { TranslateDto } from './dto/translate.dto';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeMockRedis = () => {
  const store = new Map<string, string>();
  // Stable client mock — getClient() must return the SAME object so the
  // service's cache writes land in a mock we can inspect across calls.
  const clientSet = jest.fn(
    async (key: string, value: string, mode?: string, ttl?: number) => {
      // Capture TTL assertion: mode === 'EX' and ttl === 2592000 (30 days).
      if (mode !== 'EX' || ttl !== 2592000) {
        throw new Error(
          `unexpected cache write args: ${String(mode)} ${String(ttl)}`,
        );
      }
      store.set(key, value);
      return 'OK';
    },
  );
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    setNXEX: jest.fn(),
    del: jest.fn(),
    getClient: jest.fn(() => ({ set: clientSet })),
    incrementWithExpiry: jest.fn(),
    __clientSet: clientSet,
    __store: store,
  };
};

const makeFetchResponse = (opts: {
  ok?: boolean;
  status?: number;
  translatedText?: string;
  detectedSourceLanguage?: string;
  textBody?: string;
}) => {
  const ok = opts.ok ?? true;
  return {
    ok,
    status: opts.status ?? (ok ? 200 : 429),
    json: async () => ({
      data: {
        translations: [
          {
            translatedText: opts.translatedText ?? 'Xin chào',
            detectedSourceLanguage: opts.detectedSourceLanguage ?? 'en',
          },
        ],
      },
    }),
    text: async () => opts.textBody ?? '',
  } as unknown as Response;
};

const makeAbortError = (): Error => {
  const e = new Error('aborted');
  Object.defineProperty(e, 'name', { value: 'AbortError' });
  return e;
};

const originalEnv = process.env.GOOGLE_TRANSLATE_API_KEY;

afterAll(() => {
  if (originalEnv === undefined) delete process.env.GOOGLE_TRANSLATE_API_KEY;
  else process.env.GOOGLE_TRANSLATE_API_KEY = originalEnv;
});

beforeEach(() => {
  process.env.GOOGLE_TRANSLATE_API_KEY = 'TEST-KEY';
  jest.restoreAllMocks();
});

// ─── TranslationService ─────────────────────────────────────────────────────

describe('TranslationService', () => {
  let service: TranslationService;
  let redis: ReturnType<typeof makeMockRedis>;

  beforeEach(async () => {
    redis = makeMockRedis();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationService,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    service = module.get(TranslationService);
  });

  describe('normalize / key helpers', () => {
    it('trims whitespace and NFC-normalizes input', () => {
      // e + combining acute → single é
      const decomposed = 'é';
      expect(service.normalize(`  ${decomposed}  `)).toBe('é');
    });

    it('builds deterministic keys for identical normalized inputs', () => {
      const a = service.buildKey('  Hello  ', 'EN');
      const b = service.buildKey('Hello', 'en');
      expect(a).toBe(b);
      expect(a.startsWith('translate:')).toBe(true);
    });

    it('produces the same key for composed vs decomposed unicode', () => {
      const composed = 'é'; // é
      const decomposed = 'é'; // e + combining acute
      expect(service.buildKey(composed, 'vi')).toBe(
        service.buildKey(decomposed, 'vi'),
      );
    });

    it('isolates keys across target languages', () => {
      const vi = service.buildKey('hello', 'vi');
      const en = service.buildKey('hello', 'en');
      expect(vi).not.toBe(en);
    });

    it('exposes buildTranslateKey3 with sourceLang for spec-shaped determinism', () => {
      const k1 = buildTranslateKey3('hello', 'vi', 'en');
      const k2 = buildTranslateKey3('hello', 'vi', 'en');
      const k3 = buildTranslateKey3('hello', 'vi', 'fr');
      expect(k1).toBe(k2);
      expect(k1).not.toBe(k3);
      expect(k1.startsWith('translate:')).toBe(true);
    });
  });

  describe('translate — cache miss/hit/TTL', () => {
    it('on miss calls provider once, returns cached:false, writes cache with 30-day TTL', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeFetchResponse({
          translatedText: 'Bonjour',
          detectedSourceLanguage: 'en',
        }),
      );

      const result = await service.translate('hello', 'fr');

      expect(result).toEqual({
        translatedText: 'Bonjour',
        sourceLang: 'en',
        cached: false,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // Cache write captured via getClient().set mock — asserted by TTL check inside mock.
      const clientSet = redis.getClient().set as jest.Mock;
      expect(clientSet).toHaveBeenCalledTimes(1);
      const [key, value, mode, ttl] = clientSet.mock.calls[0];
      expect(key.startsWith('translate:')).toBe(true);
      expect(JSON.parse(value)).toEqual({
        translatedText: 'Bonjour',
        sourceLang: 'en',
      });
      expect(mode).toBe('EX');
      expect(ttl).toBe(2592000);
    });

    it('returns cached:true on hit without calling provider', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      // Pre-seed cache with canonical key
      const key = service.buildKey('hello', 'fr');
      redis.__store.set(
        key,
        JSON.stringify({ translatedText: 'Bonjour', sourceLang: 'en' }),
      );

      const result = await service.translate('hello', 'fr');

      expect(result).toEqual({
        translatedText: 'Bonjour',
        sourceLang: 'en',
        cached: true,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('uses distinct cache keys for the same text to different targets', async () => {
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          makeFetchResponse({
            translatedText: 'A',
            detectedSourceLanguage: 'en',
          }),
        )
        .mockResolvedValueOnce(
          makeFetchResponse({
            translatedText: 'B',
            detectedSourceLanguage: 'en',
          }),
        );

      await service.translate('hello', 'vi');
      await service.translate('hello', 'ja');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const clientSet = redis.getClient().set as jest.Mock;
      const writtenKeys = clientSet.mock.calls.map((c: any[]) => c[0]);
      expect(new Set(writtenKeys).size).toBe(2);
    });
  });

  describe('translate — error paths', () => {
    it('returns mock translation when GOOGLE_TRANSLATE_API_KEY is missing (dev fallback)', async () => {
      delete process.env.GOOGLE_TRANSLATE_API_KEY;
      const fetchSpy = jest.spyOn(globalThis, 'fetch');

      const result = await service.translate('hello', 'vi');

      expect(result).toEqual({
        translatedText: '[vi] hello',
        sourceLang: 'auto',
        cached: false,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      // Mock still writes to cache so second call hits cache
      const key = service.buildKey('hello', 'vi');
      const cachedRaw = redis.__store.get(key);
      expect(cachedRaw).toBeDefined();
      expect(JSON.parse(cachedRaw!)).toEqual({
        translatedText: '[vi] hello',
        sourceLang: 'auto',
      });
    });

    it('throws 502 when provider responds !ok', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeFetchResponse({
          ok: false,
          status: 429,
          textBody: 'quota exceeded',
        }),
      );

      try {
        await service.translate('hello', 'vi');
        fail('should have thrown');
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
        expect(e.message).toBe('Translation provider error');
      }
    });

    it('throws 502 timeout when fetch aborts', async () => {
      jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(makeAbortError());

      try {
        await service.translate('hello', 'vi');
        fail('should have thrown');
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
        expect(e.message).toBe('Translation provider timed out');
      }
    });

    it('throws 502 when provider returns empty translations array', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { translations: [] } }),
        text: async () => '',
      } as unknown as Response);

      try {
        await service.translate('hello', 'vi');
        fail('should have thrown');
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
        expect(e.message).toBe('Translation provider returned empty result');
      }
    });

    it('treats cache-write failure as non-fatal and still returns fresh translation', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeFetchResponse({
          translatedText: 'Hola',
          detectedSourceLanguage: 'en',
        }),
      );
      const clientSet = redis.getClient().set as jest.Mock;
      clientSet.mockRejectedValueOnce(new Error('redis down'));

      const result = await service.translate('hello', 'es');

      expect(result).toEqual({
        translatedText: 'Hola',
        sourceLang: 'en',
        cached: false,
      });
    });

    it('treats corrupt cache JSON as a miss and falls through to provider', async () => {
      const key = service.buildKey('hello', 'vi');
      redis.__store.set(key, '{not valid json');
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeFetchResponse({
          translatedText: 'Chào',
          detectedSourceLanguage: 'en',
        }),
      );

      const result = await service.translate('hello', 'vi');

      expect(result.cached).toBe(false);
      expect(result.translatedText).toBe('Chào');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});

// ─── TranslateRateLimitGuard ────────────────────────────────────────────────

describe('TranslateRateLimitGuard', () => {
  let guard: TranslateRateLimitGuard;
  let redis: ReturnType<typeof makeMockRedis>;

  const makeContext = (
    user?: { userId?: string; id?: string; sub?: string },
    ip?: string,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user, ip }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    redis = makeMockRedis();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslateRateLimitGuard,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    guard = module.get(TranslateRateLimitGuard);
  });

  it('allows requests at or below the limit (count <= 30)', async () => {
    redis.incrementWithExpiry.mockResolvedValue(30);
    expect(await guard.canActivate(makeContext({ userId: 'u1' }))).toBe(true);
    expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
      'translate:rl:u1',
      60,
    );
  });

  it('throws 429 when count exceeds the limit', async () => {
    redis.incrementWithExpiry.mockResolvedValue(31);
    try {
      await guard.canActivate(makeContext({ userId: 'u1' }));
      fail('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(HttpException);
      expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('falls back to IP-based bucket when no user id is present', async () => {
    redis.incrementWithExpiry.mockResolvedValue(1);
    await guard.canActivate(makeContext(undefined, '1.2.3.4'));
    expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
      'translate:rl:ip:1.2.3.4',
      60,
    );
  });

  it('fails open when Redis is unavailable', async () => {
    redis.incrementWithExpiry.mockRejectedValue(new Error('redis down'));
    expect(await guard.canActivate(makeContext({ userId: 'u1' }))).toBe(true);
  });
});

// ─── TranslateDto validation ────────────────────────────────────────────────

describe('TranslateDto', () => {
  const errorsFor = async (input: Record<string, unknown>) => {
    const dto = plainToInstance(TranslateDto, input);
    const errs = await validate(dto);
    return errs.map((e) => e.property);
  };

  it('accepts a valid payload', async () => {
    const errs = await errorsFor({ text: 'hello world', targetLang: 'vi' });
    expect(errs).toEqual([]);
  });

  it('rejects an invalid targetLang code', async () => {
    const errs = await errorsFor({ text: 'hello', targetLang: 'xx' });
    expect(errs).toContain('targetLang');
  });

  it('rejects whitespace-only text after trimming', async () => {
    const errs = await errorsFor({ text: '   ', targetLang: 'vi' });
    expect(errs).toContain('text');
  });

  it('rejects text longer than 10000 characters', async () => {
    const errs = await errorsFor({ text: 'a'.repeat(10001), targetLang: 'vi' });
    expect(errs).toContain('text');
  });

  it('transforms mixed-case targetLang to lower-case and accepts it', async () => {
    const dto = plainToInstance(TranslateDto, {
      text: 'hi',
      targetLang: ' VI ',
    });
    const errs = await validate(dto);
    expect(errs).toEqual([]);
    expect(dto.targetLang).toBe('vi');
  });
});
