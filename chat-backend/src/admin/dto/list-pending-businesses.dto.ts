import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

export class ListPendingBusinessesDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive search against displayName or email',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Filter by verification status; "all" omits the status filter, "expiring" = verified with licenseExpiresAt trong 30 ngày tới hoặc đã quá hạn, "archived" = hồ sơ đã xóa mềm',
    enum: ['pending', 'verified', 'rejected', 'all', 'expiring', 'archived'],
  })
  @IsOptional()
  @IsIn(['pending', 'verified', 'rejected', 'all', 'expiring', 'archived'])
  status?: 'pending' | 'verified' | 'rejected' | 'all' | 'expiring' | 'archived';

  @ApiPropertyOptional({ description: 'Filter by businessCategory (exact match)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by province (exact match)' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ description: 'Filter by assignee (exact match, "của tôi")' })
  @IsOptional()
  @IsString()
  assignee?: string;

  @ApiPropertyOptional({
    description: 'Sort as field:direction, e.g. createdAt:desc',
    example: 'createdAt:asc',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z]+:(asc|desc)$/)
  sort?: string;

  @ApiPropertyOptional({
    description:
      'SLA bucket by hồ sơ chờ duyệt: over72 (>72h), day1_3 (24-72h), fresh (<24h). Chỉ áp dụng khi duyệt pending.',
    enum: ['over72', 'day1_3', 'fresh'],
  })
  @IsOptional()
  @IsIn(['over72', 'day1_3', 'fresh'])
  sla?: 'over72' | 'day1_3' | 'fresh';

  @ApiPropertyOptional({
    description:
      'Loại quan hệ doanh nghiệp do user chọn lúc đăng ký: partner (đối tác) hoặc supplier (nhà cung cấp)',
    enum: ['partner', 'supplier'],
  })
  @IsOptional()
  @IsIn(['partner', 'supplier'])
  relationshipType?: 'partner' | 'supplier';

  @ApiPropertyOptional({
    description: 'true = chỉ hồ sơ đang bị cấm, false = chỉ hồ sơ không bị cấm',
    enum: ['true', 'false'],
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  banned?: 'true' | 'false';

  @ApiPropertyOptional({
    description:
      'true = chỉ hồ sơ đang tạm ngưng bán (sản phẩm ẩn khỏi catalog), false = đang bán bình thường',
    enum: ['true', 'false'],
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  suspended?: 'true' | 'false';
}
