import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { TranslationProvider } from './translation-provider.interface';

const FETCH_TIMEOUT_MS = 3000;

// Fixed prompt — user text is data only, not instruction.
function buildLlmPrompt(text: string, targetLang: string): string {
  return `Translate to ${targetLang}, return JSON {translatedText, sourceLang}. Text: ${JSON.stringify(text)}`;
}

@Injectable()
export class LlmProvider implements TranslationProvider {
  readonly name = 'llm';
  private readonly logger = new Logger(LlmProvider.name);

  isConfigured(): boolean {
    const gate = process.env.TRANSLATION_LLM_ENABLED === 'true';
    if (!gate) return false;
    const hasKey = !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY;
    return hasKey;
  }

  async translate(
    text: string,
    targetLang: string,
  ): Promise<{ translatedText: string; sourceLang: string }> {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!this.isConfigured()) {
      throw new HttpException(
        'Translation provider error',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const prompt = buildLlmPrompt(text, targetLang);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      if (anthropicKey) {
        return await this.callAnthropic(prompt, anthropicKey, controller.signal);
      }
      if (openaiKey) {
        return await this.callOpenAI(prompt, openaiKey, controller.signal);
      }
      throw new HttpException(
        'Translation provider error',
        HttpStatus.BAD_GATEWAY,
      );
    } catch (e: unknown) {
      if (e instanceof HttpException) throw e;
      const err = e as Error & { name?: string };
      if (err.name === 'AbortError') {
        throw new HttpException(
          'Translation provider timed out',
          HttpStatus.BAD_GATEWAY,
        );
      }
      this.logger.warn(`[translate] llm fetch failed: ${err.message}`);
      throw new HttpException(
        'Translation provider error',
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async callAnthropic(
    prompt: string,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<{ translatedText: string; sourceLang: string }> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`[translate] llm anthropic ${res.status}: ${body.slice(0, 400)}`);
      throw new HttpException(
        'Translation provider error',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textBlock = json.content?.find((c) => c.type === 'text')?.text ?? '';
    if (!textBlock) {
      throw new HttpException(
        'Translation provider returned empty result',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return this.parseLlmJson(textBlock);
  }

  private async callOpenAI(
    prompt: string,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<{ translatedText: string; sourceLang: string }> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
      signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`[translate] llm openai ${res.status}: ${body.slice(0, 400)}`);
      throw new HttpException(
        'Translation provider error',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const textBlock = json.choices?.[0]?.message?.content ?? '';
    if (!textBlock) {
      throw new HttpException(
        'Translation provider returned empty result',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return this.parseLlmJson(textBlock);
  }

  private parseLlmJson(raw: string): { translatedText: string; sourceLang: string } {
    // Model should return JSON like {"translatedText":"...","sourceLang":"en"}
    // Be tolerant: extract JSON object substring.
    const trimmed = raw.trim();
    try {
      const parsed = JSON.parse(trimmed) as {
        translatedText?: string;
        sourceLang?: string;
      };
      if (typeof parsed.translatedText === 'string' && parsed.translatedText.trim()) {
        return {
          translatedText: parsed.translatedText,
          sourceLang: typeof parsed.sourceLang === 'string' ? parsed.sourceLang : 'auto',
        };
      }
    } catch {
      // fall through to substring extraction
    }

    // Try to extract first {...} JSON object from surrounding text
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as {
          translatedText?: string;
          sourceLang?: string;
        };
        if (typeof parsed.translatedText === 'string' && parsed.translatedText.trim()) {
          return {
            translatedText: parsed.translatedText,
            sourceLang: typeof parsed.sourceLang === 'string' ? parsed.sourceLang : 'auto',
          };
        }
      } catch {
        // fall through
      }
    }

    // Last resort: treat whole response as translated text
    // This keeps fallback usable even if model returns plain text.
    return { translatedText: trimmed, sourceLang: 'auto' };
  }
}
