import {
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Admin can thiệp đơn. Không thêm status REFUNDED — mobile `ChatApp` switch
 * trên 5 trạng thái cũ; hoàn tiền chỉ là metadata trên đơn hiện có.
 */
export class AdminCancelOrderDto {
  @ApiProperty({ maxLength: 500, description: 'Lý do huỷ (bắt buộc)' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class AdminRefundOrderDto {
  @ApiProperty({ maxLength: 500, description: 'Lý do hoàn tiền' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiProperty({ description: 'Số tiền hoàn (VND, > 0, không vượt tổng đơn)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;
}

export class AdminOrderNoteDto {
  @ApiProperty({ maxLength: 2000, description: 'Ghi chú nội bộ (chuỗi rỗng để xoá)' })
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  internalNote: string;
}
