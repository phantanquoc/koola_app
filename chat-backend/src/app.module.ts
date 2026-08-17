import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { MediaModule } from './media/media.module';
import { MediaCronModule } from './media-cron/media-cron.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RedisModule } from './common/redis/redis.module';
import { GatewayModule } from './gateway/gateway.module';
import { WebrtcModule } from './webrtc/webrtc.module';
import { HealthModule } from './health/health.module';
import { CallLogsModule } from './call-logs/call-logs.module';
import { MomentsModule } from './moments/moments.module';
import { AccountsModule } from './accounts/accounts.module';
import { TranslationModule } from './translation/translation.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/chat',
    ),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
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
    ]),
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
  ],
})
export class AppModule {}
