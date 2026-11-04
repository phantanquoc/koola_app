import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

/**
 * Lọc danh sách bài đăng cho trang kiểm duyệt.
 *
 * `active` là **string** chứ không phải boolean: `enableImplicitConversion`
 * của ValidationPipe biến `Boolean("false")` thành `true`, nên `?active=false`
 * sẽ lọc ngược — đúng cái bẫy đã ghi ở `music.dto.ts` (`unused`).
 *
 * Phải là class (không phải `PaginationDto & { ... }`): ValidationPipe chỉ
 * transform khi metatype là class; intersection với object literal làm metatype
 * thành Object → `page`/`limit` giữ nguyên string, không validate.
 *
 * Không có trạng thái "chờ duyệt": bài đăng lên feed ngay khi tạo. Bộ lọc này
 * chỉ để tra cứu và gỡ khi có báo cáo.
 */
export class ListPostsDto extends PaginationDto {
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
