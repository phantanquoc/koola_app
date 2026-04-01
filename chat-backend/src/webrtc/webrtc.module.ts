import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WebrtcGateway } from './webrtc.gateway';
import { WsAuthGuard } from '../gateway/guards/ws-auth.guard';
import { CallSessionService } from './services/call-session.service';
import { TurnService } from './services/turn.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET!,
      signOptions: { expiresIn: '1h' },
    }),
    ConversationsModule,
    UsersModule,
  ],
  providers: [WebrtcGateway, WsAuthGuard, CallSessionService, TurnService],
  exports: [WebrtcGateway],
})
export class WebrtcModule {}
