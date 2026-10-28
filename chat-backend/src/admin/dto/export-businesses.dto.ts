import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Xuất danh sách doanh nghiệp: cùng bộ lọc với list nhưng limit riêng (tối đa
 * 500) — tách khỏi PaginationDto vì list thường cap 100 để bảo vệ API.
 */
export class ExportBusinessesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ['pending', 'verified', 'rejected', 'all', 'expiring', 'archived'],
  })
  @IsOptional()
  @IsIn(['pending', 'verified', 'rejected', 'all', 'expiring', 'archived'])
  status?: 'pending' | 'verified' | 'rejected' | 'all' | 'expiring' | 'archived';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignee?: string;

  @ApiPropertyOptional({ enum: ['over72', 'day1_3', 'fresh'] })
  @IsOptional()
  @IsIn(['over72', 'day1_3', 'fresh'])
  sla?: 'over72' | 'day1_3' | 'fresh';

  @ApiPropertyOptional({ enum: ['partner', 'supplier'] })
  @IsOptional()
  @IsIn(['partner', 'supplier'])
  relationshipType?: 'partner' | 'supplier';

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  banned?: 'true' | 'false';

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  suspended?: 'true' | 'false';

  @ApiPropertyOptional({ example: 'createdAt:asc' })
  @IsOptional()
  @IsString()
  sort?: string;

  /** Khoảng ngày đăng ký (tính cả biên) — đối soát theo kỳ. */
  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59.999Z' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
