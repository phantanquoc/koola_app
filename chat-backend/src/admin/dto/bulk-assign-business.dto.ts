import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Gán / bỏ gán người phụ trách cho nhiều hồ sơ cùng lúc. */
export class BulkAssignBusinessDto {
  @ApiProperty({ type: [String], description: 'Business account IDs' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];

  /** Bỏ trống = gỡ người phụ trách (hồ sơ về hàng đợi chung). */
  @ApiPropertyOptional({ example: 'moderator@koola.vn' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignee?: string;
}
