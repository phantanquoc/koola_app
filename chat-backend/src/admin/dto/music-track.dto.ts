import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LicenseType } from '../../moments/schemas/music-track.schema';

export class CreateMusicTrackDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) artist: string;
  @ApiProperty() @IsNumber() @Min(1) durationMs: number;
  @ApiProperty() @IsString() @IsNotEmpty() audioKey: string;
  @ApiProperty() @IsString() @IsNotEmpty() previewKey: string;
  @ApiProperty({ enum: LicenseType }) @IsEnum(LicenseType) licenseType: LicenseType;
  @ApiProperty() @IsString() @IsNotEmpty() licenseUrl: string;
  @ApiProperty() @IsString() @IsNotEmpty() sourceUrl: string;
  @ApiPropertyOptional() @IsOptional() @IsString() attribution?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class UpdateMusicTrackDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) artist?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) durationMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() audioKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() previewKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(LicenseType) licenseType?: LicenseType;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() licenseUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() sourceUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() attribution?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() isActive?: boolean;
}
