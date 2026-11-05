import { Module, forwardRef } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { UsersModule } from '../users/users.module';
import { OpsLogModule } from '../ops/ops-log.module';

@Module({
  imports: [forwardRef(() => UsersModule), OpsLogModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
