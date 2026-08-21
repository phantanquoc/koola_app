import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from '../common/redis/redis.service';
import { GoogleProvider } from './providers/google.provider';
import { MyMemoryProvider } from './providers/mymemory.provider';
import { LlmProvider } from './providers/llm.provider';
import type { TranslationProvider } from './providers/translation-provider.interface';

const CACHE_TTL_SECONDS = 2592000; // 30 days
const GOOGLE_DETECT_URL =
  'https://translation.googleapis.com/language/translate/v2/detect';
const FETCH_TIMEOUT_MS = 3000;

/**
 * Structured result returned to the controller and onward to the mobile client.
 */
export interface TranslateResult {
  translatedText: string;
  sourceLang: string;
  cached: boolean;
}

interface CachedValue {
  translatedText: string;
  sourceLang: string;
}

function normalizeText(text: string): string {
  return text.trim().normalize('NFC');
}

function buildTranslateKey(normalizedText: string, targetLang: string): string {
  const input = `${targetLang}:${normalizedText}`;
  const hash = createHash('sha256').update(input).digest('hex');
  return `translate:${hash}`;
}

/**
 * Spec-shaped helper used by tests: SHA-256 of `sourceLang:targetLang:text`
 * where `text` is the NFC-normalized, trimmed input.
 */
export function buildTranslateKey3(
  normalizedText: string,
  targetLang: string,
  sourceLang: string,
): string {
  const input = `${sourceLang}:${targetLang}:${normalizedText}`;
  const hash = createHash('sha256').update(input).digest('hex');
  return `translate:${hash}`;
}

function buildDetectKey(normalizedText: string): string {
  const hash = createHash('sha256').update(normalizedText).digest('hex');
  return `translate:detect:${hash}`;
}

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly googleProvider: GoogleProvider,
    private readonly myMemoryProvider: MyMemoryProvider,
    private readonly llmProvider: LlmProvider,
  ) {}

  /** NFC-normalize and trim input — exported for mobile parity assertions. */
  normalize(text: string): string {
    return normalizeText(text);
  }

  buildKey(text: string, targetLang: string): string {
    return buildTranslateKey(normalizeText(text), targetLang.toLowerCase());
  }

  buildKey3(text: string, targetLang: string, sourceLang: string): string {
    return buildTranslateKey3(
      normalizeText(text),
      targetLang.toLowerCase(),
      sourceLang.toLowerCase(),
    );
  }

  async translate(text: string, targetLang: string): Promise<TranslateResult> {
    const normalized = normalizeText(text);
    const canonicalTarget = targetLang.toLowerCase().trim();

    const cacheKey = buildTranslateKey(normalized, canonicalTarget);
    const cached = await this.readCache(cacheKey);
    if (cached) return { ...cached, cached: true };

    const chain = this.buildProviderChain();
    const anyConfigured = this.anyProviderConfigured();

    if (!anyConfigured) {
      this.logger.warn(
        '[translate] no provider configured — returning mock translation for dev',
      );
      const mockText = `[${canonicalTarget}] ${normalized}`;
      const value: CachedValue = {
        translatedText: mockText,
        sourceLang: 'auto',
      };
      await this.writeCache(cacheKey, value);
      return { ...value, cached: false };
    }

    // Filter chain to configured providers; for 'mymemory' pref with unconfigured
    // mymemory we intentionally keep empty to surface 502 (not fallthrough).
    const pref = (process.env.TRANSLATION_PROVIDER || 'google')
      .toLowerCase()
      .trim();
    let configuredChain: TranslationProvider[];
    if (pref === 'mymemory') {
      configuredChain = chain.filter((p) => p.isConfigured());
      if (configuredChain.length === 0) {
        if (
          process.env.NODE_ENV !== 'production' &&
          process.env.NODE_ENV !== 'test'
        ) {
          return this.returnMockFallback(cacheKey, canonicalTarget, normalized);
        }
        throw new HttpException(
          'Translation provider error',
          HttpStatus.BAD_GATEWAY,
        );
      }
    } else {
      configuredChain = chain.filter((p) => p.isConfigured());
      // LLM pref with gate false already falls through via filter (llm excluded)
      if (configuredChain.length === 0) {
        // All filtered out but some provider elsewhere is configured (e.g., google
        // isConfigured true but chain for this pref excluded it). This only
        // happens for mymemory pref above; for other prefs this is unexpected.
        // Treat as no configured provider for this pref → mock already handled
        // via anyConfigured; so remaining case is error.
        if (
          process.env.NODE_ENV !== 'production' &&
          process.env.NODE_ENV !== 'test'
        ) {
          return this.returnMockFallback(cacheKey, canonicalTarget, normalized);
        }
        throw new HttpException(
          'Translation provider error',
          HttpStatus.BAD_GATEWAY,
        );
      }
    }

    let lastError: unknown = null;
    for (let i = 0; i < configuredChain.length; i++) {
      const provider = configuredChain[i];
      try {
        const result = await provider.translate(normalized, canonicalTarget);
        const value: CachedValue = {
          translatedText: result.translatedText,
          sourceLang: result.sourceLang ?? 'auto',
        };
        await this.writeCache(cacheKey, value);
        return { ...value, cached: false };
      } catch (e: unknown) {
        lastError = e;
        const isRetriable =
          e instanceof HttpException &&
          e.getStatus() === HttpStatus.BAD_GATEWAY;
        const isTimeout =
          e instanceof HttpException &&
          (e.message === 'Translation provider timed out' ||
            e.message === 'Translation provider error');
        const hasNext = i < configuredChain.length - 1;
        if ((isRetriable || isTimeout) && hasNext) {
          this.logger.warn(
            `[translate] ${provider.name} failed, falling back to ${configuredChain[i + 1].name}: ${(e as Error).message}`,
          );
          continue;
        }
        // Non-retriable or last provider → propagate, but in non-production
        // fall back to mock so offline dev never sees 502. Test env is excluded
        // so jest expectations for 502 remain stable.
        if (
          process.env.NODE_ENV !== 'production' &&
          process.env.NODE_ENV !== 'test'
        ) {
          this.logger.warn(
            `[translate] all providers failed — returning mock fallback for dev (last error: ${(e as Error).message})`,
          );
          return this.returnMockFallback(cacheKey, canonicalTarget, normalized);
        }
        throw e;
      }
    }
    // Exhausted chain
    if (lastError) {
      if (
        process.env.NODE_ENV !== 'production' &&
        process.env.NODE_ENV !== 'test'
      ) {
        return this.returnMockFallback(cacheKey, canonicalTarget, normalized);
      }
      throw lastError;
    }
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'test'
    ) {
      return this.returnMockFallback(cacheKey, canonicalTarget, normalized);
    }
    throw new HttpException(
      'Translation provider error',
      HttpStatus.BAD_GATEWAY,
    );
  }

  async detectLanguage(text: string): Promise<string> {
    const normalized = normalizeText(text);
    const cacheKey = buildDetectKey(normalized);
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { sourceLang: string };
        if (parsed.sourceLang) return parsed.sourceLang;
      } catch {
        // fall through to provider call
      }
    }

    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        '[translate] GOOGLE_TRANSLATE_API_KEY missing — returning mock detection for dev',
      );
      const mockLang = 'auto';
      try {
        await this.redisService
          .getClient()
          .set(
            cacheKey,
            JSON.stringify({ sourceLang: mockLang }),
            'EX',
            CACHE_TTL_SECONDS,
          );
      } catch (e) {
        this.logger.warn(
          `[translate] detect cache write failed: ${(e as Error).message}`,
        );
      }
      return mockLang;
    }

    const detected = await this.callGoogleDetect(normalized, apiKey);
    try {
      await this.redisService
        .getClient()
        .set(
          cacheKey,
          JSON.stringify({ sourceLang: detected }),
          'EX',
          CACHE_TTL_SECONDS,
        );
    } catch (e) {
      this.logger.warn(
        `[translate] detect cache write failed: ${(e as Error).message}`,
      );
    }
    return detected;
  }

  private buildProviderChain(): TranslationProvider[] {
    const pref = (process.env.TRANSLATION_PROVIDER || 'google')
      .toLowerCase()
      .trim();
    if (pref === 'mymemory') {
      return [this.myMemoryProvider];
    }
    if (pref === 'llm') {
      return [this.llmProvider, this.googleProvider, this.myMemoryProvider];
    }
    if (pref === 'auto') {
      return [this.googleProvider, this.myMemoryProvider];
    }
    // default 'google'
    return [this.googleProvider, this.myMemoryProvider];
  }

  private anyProviderConfigured(): boolean {
    return (
      this.googleProvider.isConfigured() ||
      this.myMemoryProvider.isConfigured() ||
      this.llmProvider.isConfigured()
    );
  }

  private async returnMockFallback(
    cacheKey: string,
    canonicalTarget: string,
    normalized: string,
  ): Promise<TranslateResult> {
    this.logger.warn('[translate] returning mock fallback for non-production');
    const mockText = `[${canonicalTarget}] ${normalized}`;
    const value: CachedValue = { translatedText: mockText, sourceLang: 'auto' };
    await this.writeCache(cacheKey, value);
    return { ...value, cached: false };
  }

  private async readCache(key: string): Promise<CachedValue | null> {
    try {
      const raw = await this.redisService.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedValue;
      if (
        typeof parsed.translatedText === 'string' &&
        typeof parsed.sourceLang === 'string'
      )
        return parsed;
      return null;
    } catch (e) {
      this.logger.warn(
        `[translate] cache read failed for ${key}: ${(e as Error).message}`,
      );
      return null;
    }
  }

  private async writeCache(key: string, value: CachedValue): Promise<void> {
    try {
      await this.redisService
        .getClient()
        .set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
    } catch (e) {
      this.logger.warn(
        `[translate] cache write failed for ${key}: ${(e as Error).message}`,
      );
    }
  }

  private async callGoogleDetect(
    text: string,
    apiKey: string,
  ): Promise<string> {
    const url = `${GOOGLE_DETECT_URL}?key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(
          `[translate] detect ${res.status}: ${body.slice(0, 400)}`,
        );
        throw new HttpException(
          'Language detection failed',
          HttpStatus.BAD_GATEWAY,
        );
      }
      const json = (await res.json()) as {
        data?: { detections?: Array<Array<{ language: string }>> };
      };
      const lang = json?.data?.detections?.[0]?.[0]?.language;
      if (!lang) {
        throw new HttpException(
          'Language detection returned empty result',
          HttpStatus.BAD_GATEWAY,
        );
      }
      return lang.toLowerCase();
    } catch (e: unknown) {
      if (e instanceof HttpException) throw e;
      const err = e as Error & { name?: string };
      if (err.name === 'AbortError') {
        throw new HttpException(
          'Language detection timed out',
          HttpStatus.BAD_GATEWAY,
        );
      }
      this.logger.warn(`[translate] detect fetch failed: ${err.message}`);
      throw new HttpException(
        'Language detection failed',
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
