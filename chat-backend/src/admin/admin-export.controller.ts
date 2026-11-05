import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminExportService, REPORT_EXPORT_MAX } from './admin-export.service';

export class ExportReportsDto {
  @ApiPropertyOptional({ enum: ['pending', 'resolved', 'dismissed'] })
  @IsOptional()
  @IsIn(['pending', 'resolved', 'dismissed'])
  status?: string;

  @ApiPropertyOptional({ enum: ['message', 'story', 'user', 'conversation'] })
  @IsOptional()
  @IsIn(['message', 'story', 'user', 'conversation'])
  targetType?: string;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00.000Z',
    description: 'Tính cả biên',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-10-31T23:59:59.999Z',
    description: 'Tính cả biên',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    default: REPORT_EXPORT_MAX,
    maximum: REPORT_EXPORT_MAX,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(REPORT_EXPORT_MAX)
  limit?: number;
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Throttle({
  short: { limit: 60, ttl: 60000 },
  long: { limit: 600, ttl: 60000 },
})
@Controller('admin')
export class AdminExportController {
  constructor(private readonly exportService: AdminExportService) {}

  @Get('reports/export')
  @ApiOperation({
    summary:
      'Xuất báo cáo (tối đa 500 dòng) — đối soát pháp lý. Chỉ cột của Report, không join email/SĐT người báo cáo.',
  })
  async exportReports(@Query() dto: ExportReportsDto) {
    return this.exportService.exportReports(dto);
  }
}
