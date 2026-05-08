import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { MembershipService } from './services/membership.service';
import { UnreadService } from './services/unread.service';
import { ConversationDoc, ConversationDocSchema } from './conversation.schema';
import {
  UserConversation,
  UserConversationSchema,
} from './user-conversation.schema';
import { Message, MessageSchema } from '../messages/message.schema';
import { UsersModule } from '../users/users.module';

// Message schema is shared — import Message from here in MessagesModule
export { Message, MessageSchema } from '../messages/message.schema';
export {
  ConversationDoc,
  ConversationDocSchema,
  ConversationType,
  MemberRole,
} from './conversation.schema';
export {
  UserConversation,
  UserConversationSchema,
} from './user-conversation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ConversationDoc.name, schema: ConversationDocSchema },
      { name: UserConversation.name, schema: UserConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    UsersModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, MembershipService, UnreadService],
  exports: [
    ConversationsService,
    MembershipService,
    UnreadService,
    MongooseModule,
  ],
})
export class ConversationsModule {}
