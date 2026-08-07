import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MessagesController } from './messages.controller';
import { MessagesSearchController } from './messages-search.controller';
import { MessagesSyncController } from './messages-sync.controller';
import { MessagesService } from './messages.service';
import { TypingService } from './typing.service';
import { Message, MessageSchema } from './message.schema';
import { ConversationsModule } from '../conversations/conversations.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),
    forwardRef(() => ConversationsModule),
    forwardRef(() => UsersModule),
    NotificationsModule,
    forwardRef(() => GatewayModule),
  ],
  controllers: [
    MessagesController,
    MessagesSearchController,
    MessagesSyncController,
  ],
  providers: [MessagesService, TypingService],
  exports: [MessagesService, TypingService],
})
export class MessagesModule {}
