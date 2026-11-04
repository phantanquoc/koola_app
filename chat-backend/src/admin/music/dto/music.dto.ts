import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LicenseType } from '../../../moments/schemas/music-track.schema';

export const MUSIC_STATUS_VALUES = ['all', 'active', 'inactive'] as const;
export type MusicStatus = (typeof MUSIC_STATUS_VALUES)[number];

/** Allow-listed sort keys; anything else is a 400, never silently ignored. */
export const MUSIC_SORT_FIELDS = ['addedAt', 'title', 'usageCount'] as const;
export type MusicSortField = (typeof MUSIC_SORT_FIELDS)[number];

export class ListMusicTracksDto {
  @ApiPropertyOptional({ enum: MUSIC_STATUS_VALUES, default: 'active' })
  @IsOptional()
  @IsIn(MUSIC_STATUS_VALUES as unknown as string[])
  status?: MusicStatus = 'active';

  @ApiPropertyOptional({ description: 'Substring search over title and artist' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: LicenseType })
  @IsOptional()
  @IsEnum(LicenseType)
  licenseType?: LicenseType;

  @ApiPropertyOptional({ description: 'Lọc theo một tag' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  /**
   * Only tracks with `usageCount = 0` — these are safe to retire because no
   * story points at them yet.
   *
   * Deliberately a **string** enum, not `boolean`: the global ValidationPipe
   * runs `enableImplicitConversion`, which maps the string `"false"` to
   * `Boolean("false")` = `true`. A boolean field here would silently filter
   * when the client asked not to.
   */
  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Chỉ track chưa từng được dùng' })
  @IsOptional()
  @IsIn(['true', 'false'])
  unused?: 'true' | 'false';

  @ApiPropertyOptional({ description: '`<field>:asc|desc`', example: 'addedAt:desc' })
  @IsOptional()
  @IsString()
  sort?: string;

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

export class CreateMusicTrackDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) artist: string;

  /**
   * Must be a `music-catalog/` key returned by `POST /upload-url`.
   * `durationMs` is intentionally absent: the server reads it from the file.
   * Because the global ValidationPipe uses `forbidNonWhitelisted`, a client
   * that still sends `durationMs` gets a 400 rather than a silent ignore.
   */
  @ApiProperty() @IsString() @IsNotEmpty() audioKey: string;

  @ApiProperty({ enum: LicenseType })
  @IsEnum(LicenseType)
  licenseType: LicenseType;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2048) licenseUrl: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2048) sourceUrl: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) attribution?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

/** Only these five are editable; everything else is refused by the service. */
export class UpdateMusicTrackDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) artist?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) attribution?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

export class PresignCatalogUploadDto {
  @ApiProperty({ example: 'song.mp3' }) @IsString() @IsNotEmpty() @MaxLength(255) filename: string;
  @ApiProperty({ example: 'audio/mpeg' }) @IsString() @IsNotEmpty() mimeType: string;
  @ApiProperty({ example: 3145728 }) @IsNumber() @Min(1) size: number;
}
