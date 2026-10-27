import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Xuất danh sách người dùng: cùng bộ lọc với list, nhưng limit riêng (tối đa
 * 500) — tách khỏi PaginationDto vì list thường cap 100 để bảo vệ API.
 */
export class ExportUsersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['personal', 'business'] })
  @IsOptional()
  @IsIn(['personal', 'business'])
  accountType?: 'personal' | 'business';

  @ApiPropertyOptional({ enum: ['all', 'live', 'archived', 'banned', 'admin'] })
  @IsOptional()
  @IsIn(['all', 'live', 'archived', 'banned', 'admin'])
  status?: 'all' | 'live' | 'archived' | 'banned' | 'admin';

  @ApiPropertyOptional({ enum: ['pending', 'verified', 'rejected'] })
  @IsOptional()
  @IsIn(['pending', 'verified', 'rejected'])
  verificationStatus?: 'pending' | 'verified' | 'rejected';

  @ApiPropertyOptional({ example: 'createdAt:desc' })
  @IsOptional()
  @Matches(/^[a-zA-Z]+:(asc|desc)$/)
  sort?: string;
}
