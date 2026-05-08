import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SearchMessagesDto {
  @ApiProperty({
    description: 'Search query. Minimum 2 characters, maximum 100 characters.',
    minLength: 2,
    maxLength: 100,
    example: 'xin chào',
  })
  @IsString()
  @MinLength(2, { message: 'q must be at least 2 characters' })
  @MaxLength(100, { message: 'q must be at most 100 characters' })
  q: string;

  @ApiPropertyOptional({
    description: 'Maximum number of results to return. Default 20, max 50.',
    minimum: 1,
    maximum: 50,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({
    description:
      'Cursor for pagination (opaque base64 string returned by previous response).',
    example: 'NjQ3ZjFiMjNhYzEyMzQ1Njc4OTBhYmNk',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
