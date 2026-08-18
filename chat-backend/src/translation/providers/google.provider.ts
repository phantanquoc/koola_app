import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { TranslationProvider } from './translation-provider.interface';

const GOOGLE_TRANSLATE_URL =
  'https://translation.googleapis.com/language/translate/v2';
const FETCH_TIMEOUT_MS = 3000;

@Injectable()
export class GoogleProvider implements TranslationProvider {
  readonly name = 'google';
  private readonly logger = new Logger(GoogleProvider.name);

  isConfigured(): boolean {
    return !!process.env.GOOGLE_TRANSLATE_API_KEY;
  }

  async translate(
    text: string,
    targetLang: string,
  ): Promise<{ translatedText: string; sourceLang: string }> {
    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!apiKey) {
      throw new HttpException(
        'Translation provider error',
        HttpStatus.BAD_GATEWAY,
      );
    }
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
        this.logger.warn(`[translate] provider ${res.status}: ${body.slice(0, 400)}`);
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
        sourceLang: first.detectedSourceLanguage ?? 'auto',
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
}
