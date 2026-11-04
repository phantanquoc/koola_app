import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

/**
 * Danh sách bình luận của MỘT bài.
 *
 * Cursor là `_id` (cùng cách `listPostComments` của mobile làm) chứ không phải
 * `page`: bình luận được thêm liên tục, nên offset sẽ trượt và lặp dòng khi
 * moderator lật trang trong lúc người dùng đang bình luận.
 */
export class ListPostCommentsDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Cursor `_id` của bình luận cuối trang trước',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;
}
