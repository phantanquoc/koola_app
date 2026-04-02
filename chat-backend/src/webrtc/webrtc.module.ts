import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WebrtcGateway } from './webrtc.gateway';
import { WsAuthGuard } from '../gateway/guards/ws-auth.guard';
import { CallSessionService } from './services/call-session.service';
import { TurnService } from './services/turn.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { UsersModule } from '../users/users.module';

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
  ],
  providers: [WebrtcGateway, WsAuthGuard, CallSessionService, TurnService],
  exports: [WebrtcGateway],
})
export class WebrtcModule {}
