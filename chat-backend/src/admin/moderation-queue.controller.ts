import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ModerationQueueService } from './moderation-queue.service';

export class ModerationQueueQueryDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Throttle({
  short: { limit: 60, ttl: 60000 },
  long: { limit: 600, ttl: 60000 },
})
@Controller('admin')
export class ModerationQueueController {
  constructor(private readonly queueService: ModerationQueueService) {}

  @Get('moderation-queue')
  @ApiOperation({
    summary:
      'Hàng đợi kiểm duyệt tập trung: báo cáo pending, nội dung bị báo nhiều lần, hồ sơ doanh nghiệp chờ duyệt',
  })
  async getQueue(@Query() dto: ModerationQueueQueryDto) {
    return { data: await this.queueService.getQueue(dto.limit ?? 50) };
  }
}
