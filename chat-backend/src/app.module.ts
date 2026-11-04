import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { BusinessSessionGuard } from './common/guards/business-session.guard';
import { BusinessSessionActivityInterceptor } from './common/interceptors/business-session-activity.interceptor';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { MediaModule } from './media/media.module';
import { MediaCronModule } from './media-cron/media-cron.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RedisModule } from './common/redis/redis.module';
import { RedisService } from './common/redis/redis.service';
import { RedisThrottlerStorage } from './common/redis/redis-throttler.storage';
import { GatewayModule } from './gateway/gateway.module';
import { WebrtcModule } from './webrtc/webrtc.module';
import { HealthModule } from './health/health.module';
import { CallLogsModule } from './call-logs/call-logs.module';
import { MomentsModule } from './moments/moments.module';
import { AccountsModule } from './accounts/accounts.module';
import { TranslationModule } from './translation/translation.module';
import { AdminModule } from './admin/admin.module';
import { CommerceModule } from './commerce/commerce.module';
import { BusinessMembersModule } from './business-members/business-members.module';
import {
  BusinessSession,
  BusinessSessionSchema,
} from './business-members/schemas/business-session.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // autoIndex:false — index creation is a one-time migration, not startup work
    // (autoIndex causes per-model background index builds on every cold start and
    // blocks startup on large collections). maxPoolSize:20 — bounded connection pool
    // for horizontal scaling (see docs/performance-audit-2026-08.md §6.5 and design.md D5).
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/chat',
      { autoIndex: false, maxPoolSize: 20 },
    ),
    ScheduleModule.forRoot(),
    // Redis-backed storage makes rate-limit quota global across instances:
    // the 61st request in a window returns 429 regardless of which instance
    // serves it (D4). In-memory default storage gave each pod its own counter,
    // multiplying effective quota by instance count. Inject RedisService
    // (global via RedisModule) rather than RedisThrottlerStorage, because
    // forRootAsync resolves `inject` inside ThrottlerModule's own scope.
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [
          {
            name: 'short',
            ttl: 60000,
            limit: 60,
          },
          {
            name: 'long',
            ttl: 60000,
            limit: 1000,
          },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    AuthModule,
    UsersModule,
    ConversationsModule,
    MessagesModule,
    MediaModule,
    MediaCronModule,
    NotificationsModule,
    RedisModule,
    GatewayModule,
    WebrtcModule,
    HealthModule,
    CallLogsModule,
    MomentsModule, // ← Moments feature (story system)
    AccountsModule,
    TranslationModule,
    AdminModule,
    CommerceModule,
    BusinessMembersModule, // ← Business members system (multi-member accounts)
    // The global BusinessSessionGuard injects this model directly, so it must
    // be resolvable from the root module (a feature module's registration is
    // not visible to APP_GUARD providers declared here).
    MongooseModule.forFeature([
      { name: BusinessSession.name, schema: BusinessSessionSchema },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Tasks 8.3 / 17.1 — rejects a business request from a device that was
    // evicted by a newer login. Registered AFTER JwtAuthGuard so `request.user`
    // (and its role/accountType) is already populated. Exempt the routes that
    // claim or release the session with @SkipBusinessSessionCheck().
    {
      provide: APP_GUARD,
      useClass: BusinessSessionGuard,
    },
    // Task 8.8 — touch business_sessions.lastActiveAt after every successful
    // business API call. Global so new routes are covered by default; it is a
    // no-op for personal sessions. BusinessMembersModule exports the service.
    {
      provide: APP_INTERCEPTOR,
      useClass: BusinessSessionActivityInterceptor,
    },
  ],
})
export class AppModule {}
