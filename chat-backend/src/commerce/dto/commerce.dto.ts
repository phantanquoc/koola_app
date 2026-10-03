import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { PaginationDto } from '../../admin/dto/pagination.dto';
import {
  COMMERCE_CATEGORIES,
  COMMERCE_SORT_KEYS,
  PRODUCT_DELIVERY_TEXT_MAX,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_LIST_DEFAULT_LIMIT,
  PRODUCT_LIST_MAX_LIMIT,
  PRODUCT_MAX_IMAGES,
  PRODUCT_MAX_TAGS,
  PRODUCT_NAME_MAX,
  PRODUCT_QUERY_MAX,
  PRODUCT_TAG_MAX,
  VALIDATE_MAX_IDS,
  type CommerceCategory,
  type CommerceSortKey,
} from '../commerce.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimEach = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? (value as unknown[]).map((v) => (typeof v === 'string' ? v.trim() : v))
    : value;

// ─── Public product queries ────────────────────────────────────────────────────

export class ListProductsQueryDto {
  @ApiPropertyOptional({ maxLength: PRODUCT_QUERY_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_QUERY_MAX)
  q?: string;

  @ApiPropertyOptional({ enum: COMMERCE_CATEGORIES })
  @IsOptional()
  @IsIn(COMMERCE_CATEGORIES)
  category?: CommerceCategory;

  @ApiPropertyOptional({ maxLength: PRODUCT_TAG_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_TAG_MAX)
  tag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  sellerId?: string;

  @ApiPropertyOptional({ enum: COMMERCE_SORT_KEYS, default: 'newest' })
  @IsOptional()
  @IsIn(COMMERCE_SORT_KEYS)
  sort?: CommerceSortKey;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: PRODUCT_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: PRODUCT_LIST_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PRODUCT_LIST_MAX_LIMIT)
  limit?: number = PRODUCT_LIST_DEFAULT_LIMIT;
}

export class ValidateProductsDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: VALIDATE_MAX_IDS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(VALIDATE_MAX_IDS)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ids: string[];
}

/** Admin listing: plain pagination (admin sees every product). */
export class AdminListProductsQueryDto extends PaginationDto {}

// ─── Public service queries ────────────────────────────────────────────────────

export class ListServicesQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}

// ─── Products (admin write) ────────────────────────────────────────────────────
// `soldCount`, `sellerActive` and `searchText` are deliberately absent: the
// global ValidationPipe (whitelist + forbidNonWhitelisted) rejects them with 400.

export class CreateProductDto {
  @ApiProperty({ maxLength: PRODUCT_NAME_MAX })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PRODUCT_NAME_MAX)
  name: string;

  @ApiPropertyOptional({ maxLength: PRODUCT_DESCRIPTION_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DESCRIPTION_MAX)
  description?: string;

  @ApiProperty({ description: 'Integer VND ≥ 0' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    description: 'Integer VND, must be > price; null clears it',
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  originalPrice?: number | null;

  @ApiPropertyOptional({ type: [String], maxItems: PRODUCT_MAX_IMAGES })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PRODUCT_MAX_IMAGES)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(512, { each: true })
  imageKeys?: string[];

  @ApiProperty({ enum: COMMERCE_CATEGORIES })
  @IsIn(COMMERCE_CATEGORIES)
  category: CommerceCategory;

  @ApiPropertyOptional({ type: [String], maxItems: PRODUCT_MAX_TAGS })
  @IsOptional()
  @Transform(trimEach)
  @IsArray()
  @ArrayMaxSize(PRODUCT_MAX_TAGS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(PRODUCT_TAG_MAX, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ maxLength: PRODUCT_DELIVERY_TEXT_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DELIVERY_TEXT_MAX)
  deliveryText?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ description: 'Verified business User _id' })
  @IsMongoId()
  sellerId: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ maxLength: PRODUCT_NAME_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PRODUCT_NAME_MAX)
  name?: string;

  @ApiPropertyOptional({ maxLength: PRODUCT_DESCRIPTION_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({ description: 'Integer VND ≥ 0' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    description: 'Integer VND, must be > price; null clears it',
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  originalPrice?: number | null;

  @ApiPropertyOptional({ type: [String], maxItems: PRODUCT_MAX_IMAGES })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PRODUCT_MAX_IMAGES)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(512, { each: true })
  imageKeys?: string[];

  @ApiPropertyOptional({ enum: COMMERCE_CATEGORIES })
  @IsOptional()
  @IsIn(COMMERCE_CATEGORIES)
  category?: CommerceCategory;

  @ApiPropertyOptional({ type: [String], maxItems: PRODUCT_MAX_TAGS })
  @IsOptional()
  @Transform(trimEach)
  @IsArray()
  @ArrayMaxSize(PRODUCT_MAX_TAGS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(PRODUCT_TAG_MAX, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ maxLength: PRODUCT_DELIVERY_TEXT_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DELIVERY_TEXT_MAX)
  deliveryText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Verified business User _id' })
  @IsOptional()
  @IsMongoId()
  sellerId?: string;
}

// ─── Services ──────────────────────────────────────────────────────────────────

export class CreateServiceDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) price: number;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class UpdateServiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

// ─── Stores ────────────────────────────────────────────────────────────────────

export class CreateStoreDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accent?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
}

export class UpdateStoreDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accent?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
}
