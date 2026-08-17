import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

export class ListUsersDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive search against displayName, email, or phone',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ['personal', 'business'],
    description: 'Filter by account type',
  })
  @IsOptional()
  @IsIn(['personal', 'business'])
  accountType?: 'personal' | 'business';
}
