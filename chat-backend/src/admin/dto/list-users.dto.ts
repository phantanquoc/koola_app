import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from './pagination.dto';

/**
 * Bộ lọc GET /admin/users.
 *
 * Trước đây chỉ có `search` + `accountType`, nên câu hỏi vận hành thật sự —
 * "ai đang bị cấm", "ai có quyền quản trị", "tài khoản doanh nghiệp nào chưa
 * xác minh" — không trả lời được bằng giao diện. Mỗi tab ở UI map 1-1 với
 * `status`, mỗi bộ lọc cột map với `accountType`/`verificationStatus`.
 */
export class ListUsersDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive search against displayName, email, phone, username, contactEmail, contactPhone, hoặc _id',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ['personal', 'business'],
    description: 'Filter by account type',
  })
  @IsOptional()
  @IsIn(['personal', 'business'])
  accountType?: 'personal' | 'business';

  @ApiPropertyOptional({
    description:
      'Tab trạng thái: live = mọi tài khoản đang tồn tại (mặc định), archived = đã xoá mềm, banned = đang bị cấm, admin = quản trị viên nền tảng',
    enum: ['all', 'live', 'archived', 'banned', 'admin'],
  })
  @IsOptional()
  @IsIn(['all', 'live', 'archived', 'banned', 'admin'])
  status?: 'all' | 'live' | 'archived' | 'banned' | 'admin';

  @ApiPropertyOptional({
    description: 'Chỉ có nghĩa với tài khoản doanh nghiệp',
    enum: ['pending', 'verified', 'rejected'],
  })
  @IsOptional()
  @IsIn(['pending', 'verified', 'rejected'])
  verificationStatus?: 'pending' | 'verified' | 'rejected';

  @ApiPropertyOptional({
    description: 'Sắp xếp dạng field:direction',
    example: 'createdAt:desc',
  })
  @IsOptional()
  @Matches(/^[a-zA-Z]+:(asc|desc)$/)
  sort?: string;
}
