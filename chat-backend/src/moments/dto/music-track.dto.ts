import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { LicenseType } from '../schemas/music-track.schema';

export class CreateMusicTrackDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  artist: string;

  @IsNumber()
  @Min(1)
  durationMs: number;

  @IsString()
  @IsNotEmpty()
  audioKey: string;

  @IsString()
  @IsNotEmpty()
  previewKey: string;

  @IsEnum(LicenseType)
  licenseType: LicenseType;

  @IsString()
  @IsNotEmpty()
  licenseUrl: string;

  @IsString()
  @IsNotEmpty()
  sourceUrl: string;

  @IsOptional()
  @IsString()
  attribution?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateMusicTrackDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
