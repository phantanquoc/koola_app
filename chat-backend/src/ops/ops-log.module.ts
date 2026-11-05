import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OpsLogService } from './ops-log.service';
import { OpsLogController } from './ops-log.controller';
import { OtpLog, OtpLogSchema } from './schemas/otp-log.schema';
import { PushLog, PushLogSchema } from './schemas/push-log.schema';
import { User, UserSchema } from '../users/user.schema';
import { AdminGuard } from '../auth/guards/admin.guard';

/**
 * Global: AuthService/EmailService/PlivoService/NotificationsService đều cần
 * ghi log. Global để một lần import ở AppModule là đủ, không phải sửa 4 module
 * chỉ để thêm một provider quan sát.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OtpLog.name, schema: OtpLogSchema },
      { name: PushLog.name, schema: PushLogSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [OpsLogController],
  providers: [OpsLogService, AdminGuard],
  exports: [OpsLogService],
})
export class OpsLogModule {}
