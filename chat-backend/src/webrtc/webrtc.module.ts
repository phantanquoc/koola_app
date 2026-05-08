import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WebrtcGateway } from './webrtc.gateway';
import { WsAuthGuard } from '../gateway/guards/ws-auth.guard';
import { CallSessionService } from './services/call-session.service';
import { CallSessionCronService } from './services/call-session-cron.service';
import { TurnService } from './services/turn.service';
import { CallNotificationsService } from './services/call-notifications.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { UsersModule } from '../users/users.module';
import { CallLogsModule } from '../call-logs/call-logs.module';
import { RedisModule } from '../common/redis/redis.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
    ConversationsModule,
    UsersModule,
    CallLogsModule,
    RedisModule,
  ],
  providers: [
    WebrtcGateway,
    WsAuthGuard,
    CallSessionService,
    CallSessionCronService,
    TurnService,
    CallNotificationsService,
  ],
  exports: [WebrtcGateway],
})
export class WebrtcModule {}
