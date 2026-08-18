import { Module } from '@nestjs/common';
import { RedisModule } from '../common/redis/redis.module';
import { TranslationController } from './translation.controller';
import { TranslationService } from './translation.service';
import { TranslateRateLimitGuard } from './translate-throttler.guard';
import { GoogleProvider } from './providers/google.provider';
import { MyMemoryProvider } from './providers/mymemory.provider';
import { LlmProvider } from './providers/llm.provider';

/**
 * Isolated translation feature module (message-translation + pluggable provider).
 *
 * TranslationService owns provider selection via TRANSLATION_PROVIDER env
 * (default `google`) and falls back once Google→MyMemory on retriable errors.
 * LlmProvider is gated by TRANSLATION_LLM_ENABLED + ANTHROPIC_API_KEY/OPENAI_API_KEY.
 * No factory token — selection lives in the service so the wiring has no dead provider.
 */
@Module({
  imports: [RedisModule],
  controllers: [TranslationController],
  providers: [
    GoogleProvider,
    MyMemoryProvider,
    LlmProvider,
    TranslationService,
    TranslateRateLimitGuard,
  ],
})
export class TranslationModule {}
