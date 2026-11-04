import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

/** Allow-listed sort keys; anything else is a 400, never silently ignored. */
export const POST_SORT_FIELDS = [
  'createdAt',
  'likeCount',
  'commentCount',
] as const;
export type PostSortField = (typeof POST_SORT_FIELDS)[number];

/** Phạm vi hiển thị của bài — khớp `AudienceScope` trong schema. */
export const POST_SCOPE_VALUES = ['public', 'connections', 'custom'] as const;
export type PostScopeValue = (typeof POST_SCOPE_VALUES)[number];

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

  /**
   * Tìm theo nội dung HOẶC tên tác giả. Service tự resolve tên → id, vì caption
   * và displayName nằm hai collection khác nhau nên một `$regex` không phủ được.
   */
  @ApiPropertyOptional({
    description: 'Substring không phân biệt hoa thường trên nội dung hoặc tên tác giả',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    description: '`<field>:asc|desc`',
    enum: POST_SORT_FIELDS,
    example: 'createdAt:desc',
  })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({
    description: 'Phạm vi hiển thị của bài',
    enum: POST_SCOPE_VALUES,
  })
  @IsOptional()
  @IsIn(POST_SCOPE_VALUES)
  scope?: PostScopeValue;
}
