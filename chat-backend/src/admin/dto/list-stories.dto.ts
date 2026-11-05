import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

/**
 * Lọc danh sách story cho trang kiểm duyệt Moments.
 *
 * Phải là class (không phải `PaginationDto & { ... }`): ValidationPipe chỉ
 * transform khi metatype là class; intersection với object literal làm
 * metatype thành Object → `page`/`limit` giữ nguyên string, không validate.
 */
export class ListStoriesDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Lọc theo tác giả (user id)' })
  @IsOptional()
  @IsString()
  authorId?: string;

  @ApiPropertyOptional({
    description: "'true' = đang hiển thị, 'false' = đã gỡ",
    enum: ['true', 'false'],
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  active?: string;
}
