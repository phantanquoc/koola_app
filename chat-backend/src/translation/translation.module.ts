import { Module } from '@nestjs/common';
import { RedisModule } from '../common/redis/redis.module';
import { TranslationController } from './translation.controller';
import { TranslationService } from './translation.service';
import { TranslateRateLimitGuard } from './translate-throttler.guard';

/**
 * Isolated translation feature module (message-translation change).
 *
 * Note on tasks.md 1.4: there is no `CommonModule` in this codebase — the
 * Redis provider lives in the `@Global()` `RedisModule`. It is imported here
 * explicitly as well so the module reads self-contained even if the global
 * registration ever changes.
 */
@Module({
  imports: [RedisModule],
  controllers: [TranslationController],
  providers: [TranslationService, TranslateRateLimitGuard],
})
export class TranslationModule {}
