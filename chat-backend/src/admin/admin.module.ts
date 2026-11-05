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
import { CommerceSellerVisibilityModule } from '../commerce/seller-visibility/seller-visibility.module';
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
import { AdminReportService } from './admin-report.service';
import { BroadcastService } from './broadcast.service';
import { RatelimitMonitorService } from './ratelimit-monitor.service';
import {
  BroadcastLog,
  BroadcastLogSchema,
} from './schemas/broadcast-log.schema';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationService } from './impersonation.service';
import { AuthModule } from '../auth/auth.module';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import { AppealController } from './appeal.controller';
import { ModerationQueueController } from './moderation-queue.controller';
import { AdminExportController } from './admin-export.controller';
import { AppealService } from './appeal.service';
import { ModerationQueueService } from './moderation-queue.service';
import { AdminExportService } from './admin-export.service';
import { Appeal, AppealSchema } from './schemas/appeal.schema';
import { AdminSessionService } from './admin-session.service';
import { AdminUnbanCron } from './admin-unban.cron';
import { SessionController } from './session.controller';
import { ModerationMediaService } from './moderation-media.service';
import {
  ConversationDoc,
  ConversationDocSchema,
} from '../conversations/conversation.schema';
import { Message, MessageSchema } from '../messages/message.schema';
import { Story, StorySchema } from '../moments/schemas/story.schema';
import {
  MusicTrack,
  MusicTrackSchema,
} from '../moments/schemas/music-track.schema';
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
      { name: BroadcastLog.name, schema: BroadcastLogSchema },
      { name: Appeal.name, schema: AppealSchema },
    ]),
    MediaModule,
    // Dependency-free (User + CommerceProduct models only) — NOT CommerceModule,
    // which imports AdminModule and would form a cycle (commerce-catalog D1).
    CommerceSellerVisibilityModule,
    GatewayModule,
    RedisModule,
    HealthModule,
    // ImpersonationService cần JwtService; AuthModule đã export JwtModule.
    AuthModule,
  ],
  // AdminExportController PHẢI đứng trước AdminModerationController:
  // Express khớp theo thứ tự đăng ký nên nếu sau, GET /admin/reports/export
  // bị @Get('reports/:id') bắt với id='export'.
  controllers: [
    AdminController,
    AdminExportController,
    AdminModerationController,
    AdminOpsController,
    SessionController,
    AppealController,
    ModerationQueueController,
    ImpersonationController,
  ],
  providers: [
    AdminService,
    AdminGuard,
    // @UseGuards(AdminRoleGuard) ở controller cần provider trong module này.
    AdminRoleGuard,
    AdminAuditService,
    AdminReportService,
    CoturnHealthService,
    ModerationMediaService,
    AdminSessionService,
    AdminUnbanCron,
    AppealService,
    ModerationQueueService,
    AdminExportService,
    ImpersonationService,
    BroadcastService,
    RatelimitMonitorService,
  ],
  exports: [AdminAuditService],
})
export class AdminModule {}
