import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationDto } from './pagination.dto';
import {
  ADMIN_AUDIT_ACTIONS,
  ADMIN_AUDIT_TARGET_TYPES,
  type AdminAuditAction,
  type AdminAuditTargetType,
} from '../schemas/admin-audit-log.schema';

/** Không có enum cho action: union đã là nguồn sự thật, DTO chỉ validate. */

/**
 * Bộ lọc cho GET /admin/audit-logs.
 *
 * Trước đây endpoint chỉ nhận page/limit (+ targetType/targetId rời rạc), nên
 * khi điều tra sự cố không trả lời được "ai đã làm gì trong khoảng này" —
 * câu hỏi duy nhất khiến audit log tồn tại.
 */
export class ListAuditLogsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ADMIN_AUDIT_ACTIONS, description: 'Lọc theo hành động' })
  @IsOptional()
  @IsIn(ADMIN_AUDIT_ACTIONS)
  action?: AdminAuditAction;

  @ApiPropertyOptional({
    description:
      'Tên hoặc email admin thực hiện. Tra theo tên/email thay vì bắt dán ObjectId — người điều tra biết "ai", không biết id.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  actor?: string;

  @ApiPropertyOptional({ enum: ADMIN_AUDIT_TARGET_TYPES, description: 'Loại đối tượng bị tác động' })
  @IsOptional()
  @IsIn(ADMIN_AUDIT_TARGET_TYPES)
  targetType?: AdminAuditTargetType;

  @ApiPropertyOptional({ description: 'ID đối tượng bị tác động (khớp chính xác). Bị `search` ghi đè nếu cả hai cùng gửi.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  targetId?: string;

  @ApiPropertyOptional({
    description: 'Từ thời điểm (ISO 8601), tính cả biên',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'Đến thời điểm (ISO 8601), tính cả biên',
    example: '2026-10-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Tìm chung: khớp tên/email admin thực hiện HOẶC phần mã đối tượng. Dùng cho ô tìm kiếm chính — người điều tra gõ thứ mình nhớ, không phải chọn đúng field.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    description:
      'Khớp một phần trên targetId. Dùng cho dòng bulk (targetId = "id1,id2,id3") — tra một hồ sơ vẫn ra lần duyệt hàng loạt đã đụng nó.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort as field:direction. Chỉ createdAt (mặc định) — log luôn xếp mới nhất trước.',
    example: 'createdAt:desc',
  })
  @IsOptional()
  @Matches(/^createdAt:(asc|desc)$/)
  sort?: string;
}
