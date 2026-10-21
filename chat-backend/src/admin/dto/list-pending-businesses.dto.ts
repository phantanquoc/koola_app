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
    description: 'Filter by verification status; "all" omits the status filter, "expiring" = verified with licenseExpiresAt within 30 days',
    enum: ['pending', 'verified', 'rejected', 'all', 'expiring'],
  })
  @IsOptional()
  @IsIn(['pending', 'verified', 'rejected', 'all', 'expiring'])
  status?: 'pending' | 'verified' | 'rejected' | 'all' | 'expiring';

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
}
