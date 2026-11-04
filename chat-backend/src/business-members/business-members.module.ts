import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BusinessMembersService } from './business-members.service';
import { BusinessMembersController } from './business-members.controller';
import { BusinessInvitesService } from './business-invites.service';
import { BusinessInvitesController } from './business-invites.controller';
import { BusinessSessionsService } from './business-sessions.service';
import { BusinessSessionsController } from './business-sessions.controller';
import { BusinessAuditLogsService } from './business-audit-logs.service';
import { BusinessAuditLogsController } from './business-audit-logs.controller';
import {
  BusinessMember,
  BusinessMemberSchema,
} from './schemas/business-member.schema';
import {
  BusinessInvite,
  BusinessInviteSchema,
} from './schemas/business-invite.schema';
import {
  BusinessSession,
  BusinessSessionSchema,
} from './schemas/business-session.schema';
import {
  BusinessAuditLog,
  BusinessAuditLogSchema,
} from './schemas/business-audit-log.schema';
import { User, UserSchema } from '../users/user.schema';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BusinessMember.name, schema: BusinessMemberSchema },
      { name: BusinessInvite.name, schema: BusinessInviteSchema },
      { name: BusinessSession.name, schema: BusinessSessionSchema },
      { name: BusinessAuditLog.name, schema: BusinessAuditLogSchema },
      { name: User.name, schema: UserSchema },
    ]),
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    // Tasks 8.5 / 9.11: forced-logout + sensitive-event pushes.
    // NotificationsModule imports only UsersModule, so this adds no cycle.
    NotificationsModule,
  ],
  controllers: [
    BusinessMembersController,
    BusinessInvitesController,
    BusinessSessionsController,
    BusinessAuditLogsController,
  ],
  providers: [
    BusinessMembersService,
    BusinessInvitesService,
    BusinessSessionsService,
    BusinessAuditLogsService,
  ],
  exports: [
    BusinessMembersService,
    BusinessInvitesService,
    BusinessSessionsService,
    BusinessAuditLogsService,
  ],
})
export class BusinessMembersModule {}
