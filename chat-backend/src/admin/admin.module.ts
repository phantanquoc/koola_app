import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminOpsController } from './admin-ops.controller';
import { AdminGuard } from '../auth/guards/admin.guard';
import { User, UserSchema } from '../users/user.schema';
import { RefreshToken, RefreshTokenSchema } from '../auth/refresh-token.schema';
import { MediaModule } from '../media/media.module';
import { GatewayModule } from '../gateway/gateway.module';
import { RedisModule } from '../common/redis/redis.module';
import { HealthModule } from '../health/health.module';
import { CoturnHealthService } from '../health/services/coturn-health.service';
import {
  AdminAuditLog,
  AdminAuditLogSchema,
} from './schemas/admin-audit-log.schema';
import { Report, ReportSchema } from './schemas/report.schema';
import { AdminAuditService } from './admin-audit.service';
import {
  ConversationDoc,
  ConversationDocSchema,
} from '../conversations/conversation.schema';
import { Message, MessageSchema } from '../messages/message.schema';
import { Story, StorySchema } from '../moments/schemas/story.schema';
import { MusicTrack, MusicTrackSchema } from '../moments/schemas/music-track.schema';
import {
  AudienceList,
  AudienceListSchema,
} from '../moments/schemas/audience-list.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
      { name: Report.name, schema: ReportSchema },
      { name: ConversationDoc.name, schema: ConversationDocSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Story.name, schema: StorySchema },
      { name: MusicTrack.name, schema: MusicTrackSchema },
      { name: AudienceList.name, schema: AudienceListSchema },
    ]),
    MediaModule,
    GatewayModule,
    RedisModule,
    HealthModule,
  ],
  controllers: [AdminController, AdminModerationController, AdminOpsController],
  providers: [AdminService, AdminGuard, AdminAuditService, CoturnHealthService],
  exports: [AdminAuditService],
})
export class AdminModule {}
