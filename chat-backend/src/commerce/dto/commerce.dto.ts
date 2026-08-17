import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Products ──────────────────────────────────────────────────────────────────

export class CreateProductDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) price: number;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) category: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageKey?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string | null;
}

export class UpdateProductDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) price?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageKey?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string | null;
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
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) price?: number;
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
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accent?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
}
