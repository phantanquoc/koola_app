import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

/**
 * Danh sách người đã chia sẻ một bài.
 *
 * Cursor `createdAt` (ISO) chứ không `_id`: bảng `post_shares` được ghi theo
 * thời gian và một người có thể có nhiều row, nên sắp theo `_id` không cho
 * "mới nhất trước" một cách đáng tin khi nhiều lượt share đến cùng lúc trên
 * các instance khác nhau.
 */
export class ListPostSharesDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Cursor `createdAt` (ISO) của lượt chia sẻ cuối trang trước',
    example: '2026-11-04T08:15:00.000Z',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;
}
