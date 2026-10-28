import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../admin/dto/pagination.dto';

/**
 * Bộ lọc GET /admin/otp-logs.
 * `success` là chuỗi vì query string; controller/service đổi sang boolean.
 */
export class ListOtpLogsDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'SĐT hoặc email (khớp một phần; SĐT được chuẩn hoá bỏ +84)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  phone?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  success?: 'true' | 'false';

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59.999Z' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

/** Bộ lọc GET /admin/push-logs. */
export class ListPushLogsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'ID người nhận (khớp chính xác)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @ApiPropertyOptional({ description: 'Loại push (mặc định: message)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  kind?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59.999Z' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
