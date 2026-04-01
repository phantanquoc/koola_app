import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { WsAuthGuard } from './guards/ws-auth.guard';
import { UsersModule } from '../users/users.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesModule } from '../messages/messages.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET!,
      signOptions: { expiresIn: '1h' },
    }),
    UsersModule,
    ConversationsModule,
    MessagesModule,
    forwardRef(() => NotificationsModule),
  ],
  providers: [ChatGateway, WsAuthGuard],
  exports: [ChatGateway],
})
export class GatewayModule {}
