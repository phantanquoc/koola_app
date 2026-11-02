import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import type { MemberRole } from '../../conversations/conversation.schema';

/**
 * Thân `PATCH /admin/conversations/:id/note` — chuỗi rỗng xoá ghi chú.
 * `@MaxLength(500)` khớp trần field `internalNote` trong schema.
 */
export class UpdateConversationNoteDto {
  @ApiProperty({
    maxLength: 500,
    description: 'Ghi chú nội bộ; chuỗi rỗng để xoá',
  })
  @IsString()
  @MaxLength(500)
  note: string;
}

/** Thân `POST /admin/conversations/:id/members/:userId/role`. */
export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ['member', 'admin'] })
  @IsIn(['member', 'admin'])
  role: MemberRole;
}
