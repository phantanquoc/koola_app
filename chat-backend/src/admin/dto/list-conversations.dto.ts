import {
  IsString,
  IsOptional,
  IsBooleanString,
  IsInt,
  Min,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationDto } from './pagination.dto';

export class ListConversationsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search by name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Conversation type filter' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description: 'Only conversations with a pending report',
  })
  @IsOptional()
  @IsBooleanString()
  hasPendingReport?: string;

  @ApiPropertyOptional({ description: 'Minimum member count' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minMembers?: number;

  @ApiPropertyOptional({ description: 'Maximum member count' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxMembers?: number;

  @ApiPropertyOptional({
    description: 'Sort: recent | created | reported | members',
    enum: ['recent', 'created', 'reported', 'members'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['recent', 'created', 'reported', 'members'])
  sort?: string;

  @ApiPropertyOptional({
    description: 'Minimum pending conversation-report count',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minReports?: number;

  @ApiPropertyOptional({
    description: 'Only conversations active since ISO datetime',
  })
  @IsOptional()
  @IsString()
  activeAfter?: string;

  @ApiPropertyOptional({
    description: 'Last-activity range start (ISO datetime)',
  })
  @IsOptional()
  @IsString()
  activeFrom?: string;

  @ApiPropertyOptional({
    description: 'Last-activity range end (ISO datetime)',
  })
  @IsOptional()
  @IsString()
  activeTo?: string;

  @ApiPropertyOptional({ description: 'Creation range start (ISO datetime)' })
  @IsOptional()
  @IsString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'Creation range end (ISO datetime)' })
  @IsOptional()
  @IsString()
  createdTo?: string;

  @ApiPropertyOptional({
    description: 'Only conversations containing media messages',
  })
  @IsOptional()
  @IsBooleanString()
  hasMedia?: string;
}
