import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { TranslationProvider } from './translation-provider.interface';

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const FETCH_TIMEOUT_MS = 3000;

@Injectable()
export class MyMemoryProvider implements TranslationProvider {
  readonly name = 'mymemory';
  private readonly logger = new Logger(MyMemoryProvider.name);

  isConfigured(): boolean {
    // Free tier works unauthenticated; email only lifts quota.
    // Default true so Google→MyMemory fallback is attempted without extra env.
    // Set MYMEMORY_ENABLED=false to disable (forces mock when Google also
    // unconfigured) and to allow offline dev to get `[lang] text` mock
    // instead of 502 when the network is unavailable.
    // TRANSLATION_PROVIDER=google-strict disables fallback entirely.
    if (process.env.MYMEMORY_ENABLED === 'false') return false;
    if (
      (process.env.TRANSLATION_PROVIDER ?? '').toLowerCase().trim() ===
      'google-strict'
    )
      return false;
    return true;
  }

  async translate(
    text: string,
    targetLang: string,
  ): Promise<{ translatedText: string; sourceLang: string }> {
    const email = process.env.MYMEMORY_EMAIL?.trim();
    // Source auto-detected: MyMemory requires langpair source|target.
    // Use empty/auto source which MyMemory treats as autodetect; encode pipe correctly.
    const langpair = `en|${targetLang}`;
    const params = new URLSearchParams({
      q: text,
      langpair,
    });
    if (email) params.set('de', email);

    const url = `${MYMEMORY_URL}?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(
          `[translate] mymemory ${res.status}: ${body.slice(0, 400)}`,
        );
        throw new HttpException(
          'Translation provider error',
          HttpStatus.BAD_GATEWAY,
        );
      }
      const json = (await res.json()) as {
        responseData?: { translatedText?: string };
        responseStatus?: number;
        responseDetails?: string;
        quotaFinished?: boolean;
        matches?: Array<{ translation?: string }>;
      };

      // MyMemory returns responseStatus !== 200 on quota/usage errors
      if (json.responseStatus !== undefined && json.responseStatus !== 200) {
        const detail = json.responseDetails ?? '';
        // Common quotaExceeded payload still has 200 HTTP but responseStatus 429-like
        this.logger.warn(
          `[translate] mymemory responseStatus ${json.responseStatus}: ${detail.slice(0, 400)}`,
        );
        throw new HttpException(
          'Translation provider error',
          HttpStatus.BAD_GATEWAY,
        );
      }

      if (json.quotaFinished) {
        this.logger.warn('[translate] mymemory quotaFinished');
        throw new HttpException(
          'Translation provider error',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const translated = json.responseData?.translatedText?.trim();
      // MyMemory quotaExceeded returns translatedText containing "MYMEMORY WARNING"
      if (!translated || translated.includes('MYMEMORY WARNING')) {
        this.logger.warn(
          `[translate] mymemory empty or quota warning: ${String(translated).slice(0, 400)}`,
        );
        throw new HttpException(
          'Translation provider error',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return {
        translatedText: translated,
        sourceLang: 'auto',
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
      this.logger.warn(`[translate] mymemory fetch failed: ${err.message}`);
      throw new HttpException(
        'Translation provider error',
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
