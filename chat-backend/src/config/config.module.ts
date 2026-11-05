import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfig, AppConfigSchema } from './config.schema';
import { ConfigService } from './config.service';
import { ConfigController } from './config.controller';
import { AdminGuard } from '../auth/guards/admin.guard';
import { User, UserSchema } from '../users/user.schema';
import {
  AdminAuditLog,
  AdminAuditLogSchema,
} from '../admin/schemas/admin-audit-log.schema';

/**
 * Module độc lập, không import AdminModule: AdminModule sẽ import ConfigModule
 * để đọc cờ, import ngược lại tạo vòng. Vì vậy audit ghi qua model trực tiếp,
 * và AdminGuard tự khai báo (nó chỉ phụ thuộc model User — không phải AdminModule).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AppConfig.name, schema: AppConfigSchema },
      { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ConfigController],
  providers: [ConfigService, AdminGuard],
  exports: [ConfigService],
})
export class ConfigModule {}
