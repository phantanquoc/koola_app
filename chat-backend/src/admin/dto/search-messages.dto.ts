import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

export class SearchMessagesDto extends PaginationDto {
  @ApiProperty({ description: 'Search query (required)' })
  @IsString()
  @IsNotEmpty()
  q: string;

  @ApiPropertyOptional({ description: 'Filter by conversation id' })
  @IsOptional()
  @IsString()
  conversationId?: string;
}
