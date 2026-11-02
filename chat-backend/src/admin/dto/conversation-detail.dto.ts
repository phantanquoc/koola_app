import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ConversationDetailDto {
  @ApiPropertyOptional({
    description: 'Load messages older than this ISO datetime',
  })
  @IsOptional()
  @IsDateString()
  before?: string;

  @ApiPropertyOptional({
    description:
      'Chỉ trả tin nhắn của người gửi này. Lọc ở server để bản xem đã lọc là đầy đủ, không chỉ một trang tải sẵn.',
  })
  @IsOptional()
  @IsString()
  senderId?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
