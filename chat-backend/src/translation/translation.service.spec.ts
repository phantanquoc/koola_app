import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { TranslationService, buildTranslateKey3 } from './translation.service';
import { TranslateRateLimitGuard } from './translate-throttler.guard';
import { RedisService } from '../common/redis/redis.service';
import { TranslateDto } from './dto/translate.dto';
import { GoogleProvider } from './providers/google.provider';
import { MyMemoryProvider } from './providers/mymemory.provider';
import { LlmProvider } from './providers/llm.provider';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeMockRedis = () => {
  const store = new Map<string, string>();
  const clientSet = jest.fn(
    async (key: string, value: string, mode?: string, ttl?: number) => {
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

const makeMyMemoryResponse = (opts: {
  ok?: boolean;
  status?: number;
  translatedText?: string;
  responseStatus?: number;
  quotaFinished?: boolean;
  textBody?: string;
}) => {
  const ok = opts.ok ?? true;
  return {
    ok,
    status: opts.status ?? (ok ? 200 : 429),
    json: async () => ({
      responseData: { translatedText: opts.translatedText ?? 'Hola MyMemory' },
      responseStatus: opts.responseStatus ?? 200,
      responseDetails: '',
      quotaFinished: opts.quotaFinished ?? false,
      matches: [],
    }),
    text: async () => opts.textBody ?? '',
  } as unknown as Response;
};

const makeLlmAnthropicResponse = (opts: {
  ok?: boolean;
  status?: number;
  translatedText?: string;
  sourceLang?: string;
  textBody?: string;
}) => {
  const ok = opts.ok ?? true;
  return {
    ok,
    status: opts.status ?? (ok ? 200 : 429),
    json: async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            translatedText: opts.translatedText ?? 'LLM translated',
            sourceLang: opts.sourceLang ?? 'en',
          }),
        },
      ],
    }),
    text: async () => opts.textBody ?? '',
  } as unknown as Response;
};

const makeAbortError = (): Error => {
  const e = new Error('aborted');
  Object.defineProperty(e, 'name', { value: 'AbortError' });
  return e;
};

const originalEnv = {
  GOOGLE_TRANSLATE_API_KEY: process.env.GOOGLE_TRANSLATE_API_KEY,
  TRANSLATION_PROVIDER: process.env.TRANSLATION_PROVIDER,
  MYMEMORY_EMAIL: process.env.MYMEMORY_EMAIL,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  TRANSLATION_LLM_ENABLED: process.env.TRANSLATION_LLM_ENABLED,
};

afterAll(() => {
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined)
      delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string>)[k] = v;
  }
});

beforeEach(() => {
  process.env.GOOGLE_TRANSLATE_API_KEY = 'TEST-KEY';
  delete process.env.TRANSLATION_PROVIDER;
  delete process.env.MYMEMORY_EMAIL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.TRANSLATION_LLM_ENABLED;
  jest.restoreAllMocks();
});

// ─── TranslationService ─────────────────────────────────────────────────────

describe('TranslationService', () => {
  let service: TranslationService;
  let redis: ReturnType<typeof makeMockRedis>;
  let googleProvider: GoogleProvider;
  let myMemoryProvider: MyMemoryProvider;
  let llmProvider: LlmProvider;

  const createService = async () => {
    redis = makeMockRedis();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationService,
        GoogleProvider,
        MyMemoryProvider,
        LlmProvider,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    service = module.get(TranslationService);
    googleProvider = module.get(GoogleProvider);
    myMemoryProvider = module.get(MyMemoryProvider);
    llmProvider = module.get(LlmProvider);
  };

  beforeEach(async () => {
    await createService();
  });

  describe('normalize / key helpers', () => {
    it('trims whitespace and NFC-normalizes input', () => {
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
      const composed = 'é';
      const decomposed = 'é';
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
      const writtenKeys = clientSet.mock.calls.map((c: unknown[]) => c[0]);
      expect(new Set(writtenKeys).size).toBe(2);
    });

    it('cache is provider-agnostic: hit skips provider even with different TRANSLATION_PROVIDER', async () => {
      // Seed via google
      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeFetchResponse({
          translatedText: 'Bonjour',
          detectedSourceLanguage: 'en',
        }),
      );
      await service.translate('hello', 'fr');
      jest.clearAllMocks();

      // Now switch provider to mymemory, same key should be hit
      process.env.TRANSLATION_PROVIDER = 'mymemory';
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      const key = service.buildKey('hello', 'fr');
      // key already in store from previous call's write
      expect(redis.__store.get(key)).toBeDefined();
      const result = await service.translate('hello', 'fr');
      expect(result.cached).toBe(true);
      expect(result.translatedText).toBe('Bonjour');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('translate — error paths', () => {
    it('returns mock translation when all providers unconfigured (dev fallback)', async () => {
      // Force all providers to report not configured
      jest.spyOn(googleProvider, 'isConfigured').mockReturnValue(false);
      jest.spyOn(myMemoryProvider, 'isConfigured').mockReturnValue(false);
      jest.spyOn(llmProvider, 'isConfigured').mockReturnValue(false);
      const fetchSpy = jest.spyOn(globalThis, 'fetch');

      const result = await service.translate('hello', 'vi');

      expect(result).toEqual({
        translatedText: '[vi] hello',
        sourceLang: 'auto',
        cached: false,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      const key = service.buildKey('hello', 'vi');
      const cachedRaw = redis.__store.get(key);
      expect(cachedRaw).toBeDefined();
      expect(JSON.parse(cachedRaw!)).toEqual({
        translatedText: '[vi] hello',
        sourceLang: 'auto',
      });
    });

    it('mock is cached: second identical request returns cached:true without provider', async () => {
      jest.spyOn(googleProvider, 'isConfigured').mockReturnValue(false);
      jest.spyOn(myMemoryProvider, 'isConfigured').mockReturnValue(false);
      jest.spyOn(llmProvider, 'isConfigured').mockReturnValue(false);

      await service.translate('hello', 'vi');
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      const result2 = await service.translate('hello', 'vi');
      expect(result2.cached).toBe(true);
      expect(result2.translatedText).toBe('[vi] hello');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('throws 502 when provider responds !ok and fallback also fails', async () => {
      // Google fails, MyMemory will also be attempted — make both fail
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          makeFetchResponse({
            ok: false,
            status: 429,
            textBody: 'quota exceeded',
          }),
        )
        .mockResolvedValueOnce(makeMyMemoryResponse({ responseStatus: 429 }));

      try {
        await service.translate('hello', 'vi');
        fail('should have thrown');
      } catch (e: unknown) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
        expect((e as HttpException).message).toBe('Translation provider error');
      }
    });

    it('throws 502 timeout when fetch aborts (both providers)', async () => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(makeAbortError())
        .mockRejectedValueOnce(makeAbortError());

      try {
        await service.translate('hello', 'vi');
        fail('should have thrown');
      } catch (e: unknown) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
        expect((e as HttpException).message).toBe(
          'Translation provider timed out',
        );
      }
    });

    it('throws 502 when provider returns empty translations array (fallback also fails)', async () => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { translations: [] } }),
          text: async () => '',
        } as unknown as Response)
        .mockResolvedValueOnce(
          makeMyMemoryResponse({
            translatedText:
              'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS',
            responseStatus: 200,
          }),
        );

      try {
        await service.translate('hello', 'vi');
        fail('should have thrown');
      } catch (e: unknown) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
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

  describe('translate — provider selection and fallback (pluggable)', () => {
    it('Google 429 fallback to MyMemory succeeds and caches MyMemory result', async () => {
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          makeFetchResponse({
            ok: false,
            status: 429,
            textBody: 'quota exceeded',
          }),
        )
        .mockResolvedValueOnce(
          makeMyMemoryResponse({
            translatedText: 'Xin chào MyMemory',
            responseStatus: 200,
          }),
        );

      const result = await service.translate('hello', 'vi');

      expect(result).toEqual({
        translatedText: 'Xin chào MyMemory',
        sourceLang: 'auto',
        cached: false,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      // Cache should hold MyMemory result
      const key = service.buildKey('hello', 'vi');
      const cached = JSON.parse(redis.__store.get(key)!);
      expect(cached).toEqual({
        translatedText: 'Xin chào MyMemory',
        sourceLang: 'auto',
      });
    });

    it('Google timeout fallback to MyMemory succeeds', async () => {
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(makeAbortError())
        .mockResolvedValueOnce(
          makeMyMemoryResponse({ translatedText: 'Hola via fallback' }),
        );

      const result = await service.translate('hello', 'es');

      expect(result.translatedText).toBe('Hola via fallback');
      expect(result.cached).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('both providers fail returns 502 and does not write cache', async () => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          makeFetchResponse({
            ok: false,
            status: 502,
            textBody: 'bad gateway',
          }),
        )
        .mockResolvedValueOnce(
          makeMyMemoryResponse({
            ok: false,
            status: 502,
            textBody: 'bad gateway',
          }),
        );

      const key = service.buildKey('hello', 'vi');
      try {
        await service.translate('hello', 'vi');
        fail('should have thrown');
      } catch (e: unknown) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      }
      expect(redis.__store.get(key)).toBeUndefined();
    });

    it('TRANSLATION_PROVIDER=mymemory direct path bypasses Google', async () => {
      process.env.TRANSLATION_PROVIDER = 'mymemory';
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeMyMemoryResponse({
          translatedText: 'Direct MyMemory',
          responseStatus: 200,
        }),
      );

      const result = await service.translate('hello', 'fr');

      expect(result.translatedText).toBe('Direct MyMemory');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // Ensure the fetch URL was MyMemory (contains mymemory)
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('mymemory');
    });

    it('TRANSLATION_PROVIDER=auto tries Google then MyMemory on failure', async () => {
      process.env.TRANSLATION_PROVIDER = 'auto';
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          makeFetchResponse({ ok: false, status: 429, textBody: 'quota' }),
        )
        .mockResolvedValueOnce(
          makeMyMemoryResponse({ translatedText: 'Auto fallback' }),
        );

      const result = await service.translate('hello', 'vi');
      expect(result.translatedText).toBe('Auto fallback');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('TRANSLATION_PROVIDER=llm without gate falls through to Google', async () => {
      process.env.TRANSLATION_PROVIDER = 'llm';
      // LLM gate false by default → should skip llm and use Google
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeFetchResponse({
          translatedText: 'Google fallback from llm',
          detectedSourceLanguage: 'en',
        }),
      );

      const result = await service.translate('hello', 'vi');

      expect(result.translatedText).toBe('Google fallback from llm');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(llmProvider.isConfigured()).toBe(false);
    });

    it('LLM gated true uses LLM provider directly', async () => {
      process.env.TRANSLATION_PROVIDER = 'llm';
      process.env.TRANSLATION_LLM_ENABLED = 'true';
      process.env.ANTHROPIC_API_KEY = 'sk-test';

      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeLlmAnthropicResponse({
          translatedText: 'LLM hello',
          sourceLang: 'en',
        }),
      );

      const result = await service.translate('hello', 'vi');

      expect(result.translatedText).toBe('LLM hello');
      expect(result.sourceLang).toBe('en');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('anthropic');
    });

    it('LLM gated true but provider fails falls back to Google then MyMemory', async () => {
      process.env.TRANSLATION_PROVIDER = 'llm';
      process.env.TRANSLATION_LLM_ENABLED = 'true';
      process.env.ANTHROPIC_API_KEY = 'sk-test';

      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          makeLlmAnthropicResponse({
            ok: false,
            status: 429,
            textBody: 'llm quota',
          }) as unknown as Response,
        )
        .mockResolvedValueOnce(
          makeFetchResponse({
            ok: false,
            status: 429,
            textBody: 'google quota',
          }),
        )
        .mockResolvedValueOnce(
          makeMyMemoryResponse({ translatedText: 'Final fallback' }),
        );

      const result = await service.translate('hello', 'vi');
      expect(result.translatedText).toBe('Final fallback');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('Google success does not call MyMemory', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeFetchResponse({
          translatedText: 'Direct Google',
          detectedSourceLanguage: 'en',
        }),
      );

      const result = await service.translate('hello', 'vi');
      expect(result.translatedText).toBe('Direct Google');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('isConfigured contracts: Google requires key, LLM requires gate+key, MyMemory always true', () => {
      process.env.GOOGLE_TRANSLATE_API_KEY = '';
      expect(googleProvider.isConfigured()).toBe(false);
      process.env.GOOGLE_TRANSLATE_API_KEY = 'k';
      expect(googleProvider.isConfigured()).toBe(true);

      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.TRANSLATION_LLM_ENABLED;
      expect(llmProvider.isConfigured()).toBe(false);
      process.env.TRANSLATION_LLM_ENABLED = 'true';
      expect(llmProvider.isConfigured()).toBe(false);
      process.env.ANTHROPIC_API_KEY = 'sk-xyz';
      expect(llmProvider.isConfigured()).toBe(true);

      expect(myMemoryProvider.isConfigured()).toBe(true);
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
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
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
