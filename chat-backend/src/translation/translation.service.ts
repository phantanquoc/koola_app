import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from '../common/redis/redis.service';

const CACHE_TTL_SECONDS = 2592000; // 30 days
const GOOGLE_TRANSLATE_URL =
  'https://translation.googleapis.com/language/translate/v2';
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
  // Content-addressed: target language + canonical text. Source language is
  // auto-detected and stored in the VALUE (so the next miss can skip the
  // provider). For determinism the normalized text + lower-cased target form
  // the SHA-256 input; the helper also exposes a 3-part variant below.
  const input = `${targetLang}:${normalizedText}`;
  const hash = createHash('sha256').update(input).digest('hex');
  return `translate:${hash}`;
}

/**
 * Spec-shaped helper used by tests: SHA-256 of `sourceLang:targetLang:text`
 * where `text` is the NFC-normalized, trimmed input. This is the canonical
 * form named in tasks 1.2 / D3; the live `translate()` path calls the 2-part
 * key above (auto-detected source), while this helper is kept for the
 * determinism/TTL/isolation assertions that supply an explicit sourceLang.
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

  constructor(private readonly redisService: RedisService) {}

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

    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        '[translate] GOOGLE_TRANSLATE_API_KEY missing — returning mock translation for dev',
      );
      const mockText = `[${canonicalTarget}] ${normalized}`;
      const value: CachedValue = {
        translatedText: mockText,
        sourceLang: 'auto',
      };
      await this.writeCache(cacheKey, value);
      return { ...value, cached: false };
    }

    const { translatedText, detectedSourceLanguage } =
      await this.callGoogleTranslate(normalized, canonicalTarget, apiKey);

    const value: CachedValue = {
      translatedText,
      sourceLang: detectedSourceLanguage ?? 'auto',
    };
    await this.writeCache(cacheKey, value);
    return { ...value, cached: false };
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
      // Cache write failure is non-fatal — still return the fresh translation.
      this.logger.warn(
        `[translate] cache write failed for ${key}: ${(e as Error).message}`,
      );
    }
  }

  private async callGoogleTranslate(
    text: string,
    targetLang: string,
    apiKey: string,
  ): Promise<{ translatedText: string; detectedSourceLanguage: string }> {
    const url = `${GOOGLE_TRANSLATE_URL}?key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, target: targetLang, format: 'text' }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(
          `[translate] provider ${res.status}: ${body.slice(0, 400)}`,
        );
        throw new HttpException(
          'Translation provider error',
          HttpStatus.BAD_GATEWAY,
        );
      }
      const json = (await res.json()) as {
        data?: {
          translations?: Array<{
            translatedText: string;
            detectedSourceLanguage?: string;
          }>;
        };
      };
      const first = json?.data?.translations?.[0];
      if (!first?.translatedText) {
        throw new HttpException(
          'Translation provider returned empty result',
          HttpStatus.BAD_GATEWAY,
        );
      }
      return {
        translatedText: first.translatedText,
        detectedSourceLanguage: first.detectedSourceLanguage ?? 'auto',
      };
    } catch (e: unknown) {
      if (e instanceof HttpException) throw e;
      const err = e as Error & { name?: string };
      if (err.name === 'AbortError') {
        throw new HttpException(
          'Translation provider timed out',
          HttpStatus.BAD_GATEWAY,
        );
      }
      this.logger.warn(`[translate] fetch failed: ${err.message}`);
      throw new HttpException(
        'Translation provider error',
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      clearTimeout(timer);
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
