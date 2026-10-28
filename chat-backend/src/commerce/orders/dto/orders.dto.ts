import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ORDER_STATUSES } from '../schemas/commerce-order.schema';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const ORDER_PAYMENTS = ['cod', 'bank'] as const;

// ─── Placement ───────────────────────────────────────────────────────────────

export class PlaceOrderItemDto {
  @ApiProperty({ description: 'CommerceProduct _id' })
  @IsMongoId()
  productId: string;

  @ApiProperty({ description: 'Quantity 1–99', minimum: 1, maximum: 99 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  qty: number;
}

export class BuyerInfoDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ maxLength: 20 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class PlaceOrderDto {
  @ApiProperty({ description: 'Verified business User _id' })
  @IsMongoId()
  sellerId: string;

  @ApiProperty({ type: [PlaceOrderItemDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PlaceOrderItemDto)
  items: PlaceOrderItemDto[];

  @ApiProperty({ type: BuyerInfoDto })
  @ValidateNested()
  @Type(() => BuyerInfoDto)
  buyerInfo: BuyerInfoDto;

  @ApiProperty({ enum: ORDER_PAYMENTS })
  @IsIn(ORDER_PAYMENTS)
  payment: 'cod' | 'bank';

  @ApiProperty({
    description:
      'UUID generated once per checkout; retries reuse it. Duplicates return the existing order (200).',
  })
  @IsUUID()
  idempotencyKey: string;
}

// ─── Transitions ─────────────────────────────────────────────────────────────

export class ConfirmOrderDto {
  @ApiProperty({ description: 'Shipping fee (VND, integer ≥ 0)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  shippingFee: number;

  @ApiProperty({ description: 'ISO date of the promised delivery' })
  @IsISO8601()
  expectedDeliveryDate: string;
}

export class RejectOrderDto {
  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class ShipOrderDto {
  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  carrier?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  trackingCode?: string;
}

export class CancelOrderDto {
  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Required for sellers, ignored for buyers',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export class ListOrdersQueryDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class AdminListOrdersQueryDto extends ListOrdersQueryDto {
  @ApiPropertyOptional({ description: 'Filter by buyer User _id' })
  @IsOptional()
  @IsMongoId()
  buyerId?: string;

  @ApiPropertyOptional({ description: 'Filter by seller business User _id' })
  @IsOptional()
  @IsMongoId()
  sellerId?: string;
}

/**
 * Xuất đơn: cùng bộ lọc với danh sách admin nhưng cap riêng 500 (list cap 100
 * để bảo vệ API). Khai báo lại `limit` để @Max(500) của lớp con thay @Max(100)
 * của lớp cha — class-validator loại metadata trùng tên khi kế thừa.
 */
export class ExportOrdersDto extends AdminListOrdersQueryDto {
  @ApiPropertyOptional({ default: 500, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 500;
}
