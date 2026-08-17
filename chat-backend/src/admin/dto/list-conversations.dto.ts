import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

export class ListConversationsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search by name or topic' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Conversation type filter' })
  @IsOptional()
  @IsString()
  type?: string;
}
