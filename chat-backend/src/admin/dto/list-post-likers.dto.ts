import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

/**
 * Danh sách người đã thích một bài.
 *
 * Cursor `_id` thay vì `page`: người dùng tiếp tục thích trong lúc moderator
 * lật trang, offset sẽ trượt và lặp dòng — cùng lý do `listComments` dùng cursor.
 */
export class ListPostLikersDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Cursor `_id` của lượt thích cuối trang trước',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;
}
