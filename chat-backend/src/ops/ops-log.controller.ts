import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { OpsLogService } from './ops-log.service';
import { ListOtpLogsDto, ListPushLogsDto } from './dto/list-ops-logs.dto';

/**
 * Nhật ký vận hành OTP/SMS và push/FCM. Chỉ đọc, chỉ admin.
 * SĐT trong response đã được che ở service — controller không nới thêm field nào.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class OpsLogController {
  constructor(private readonly opsLogService: OpsLogService) {}

  @Get('otp-logs')
  @Throttle({
    short: { limit: 60, ttl: 60000 },
    long: { limit: 600, ttl: 60000 },
  })
  listOtp(@Query() dto: ListOtpLogsDto) {
    return this.opsLogService.listOtp(dto);
  }

  @Get('push-logs')
  @Throttle({
    short: { limit: 60, ttl: 60000 },
    long: { limit: 600, ttl: 60000 },
  })
  listPush(@Query() dto: ListPushLogsDto) {
    return this.opsLogService.listPush(dto);
  }
}
