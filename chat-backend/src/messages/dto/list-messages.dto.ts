import { IsOptional, IsDateString, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListMessagesDto {
  @ApiPropertyOptional({ example: '2026-03-31T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  cursor?: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
