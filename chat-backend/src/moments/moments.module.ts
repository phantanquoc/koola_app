import { Module, forwardRef, OnModuleInit, Inject } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MomentsController } from './moments.controller';
import { MomentsService } from './moments.service';
import { MomentsGateway } from './moments.gateway';
import { Story, StorySchema } from './schemas/story.schema';
import { StoryView, StoryViewSchema } from './schemas/story-view.schema';
import { Highlight, HighlightSchema } from './schemas/highlight.schema';
import {
  AudienceList,
  AudienceListSchema,
} from './schemas/audience-list.schema';
import { MusicTrack, MusicTrackSchema } from './schemas/music-track.schema';
import { RedisModule } from '../common/redis/redis.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesModule } from '../messages/messages.module';
import { UsersModule } from '../users/users.module';
import { GatewayModule } from '../gateway/gateway.module';
import { ChatGateway } from '../gateway/chat.gateway';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Story.name, schema: StorySchema },
      { name: StoryView.name, schema: StoryViewSchema },
      { name: Highlight.name, schema: HighlightSchema },
      { name: AudienceList.name, schema: AudienceListSchema },
      { name: MusicTrack.name, schema: MusicTrackSchema },
    ]),
    RedisModule,
    forwardRef(() => NotificationsModule),
    ConversationsModule,
    forwardRef(() => MessagesModule),
    UsersModule,
    forwardRef(() => GatewayModule),
  ],
  controllers: [MomentsController],
  providers: [MomentsService, MomentsGateway],
  exports: [MomentsService, MomentsGateway],
})
export class MomentsModule implements OnModuleInit {
  constructor(
    private readonly momentsService: MomentsService,
    private readonly momentsGateway: MomentsGateway,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  onModuleInit() {
    // Wire service → gateway so MomentsService can emit events
    this.momentsService.setGateway(this.momentsGateway);

    // Wire the Socket.IO server from ChatGateway into MomentsGateway
    // ChatGateway.io is populated after WebSocket initialization (afterInit)
    // We use a lazy getter — the gateway defers io access until first emit
    this.momentsGateway.setChatGateway(this.chatGateway);
  }
}
