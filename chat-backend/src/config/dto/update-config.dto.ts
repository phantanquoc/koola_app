import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
  registerDecorator,
} from 'class-validator';
import type { ValidationOptions } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Phiên bản dạng 1 / 1.2 / 1.2.3 — chặn chuỗi rác làm app so sánh sai. */
const VERSION = /^\d{1,4}(\.\d{1,4}){0,3}$/;

/**
 * Tên cờ chỉ cho chữ/số/gạch, không cho "." hay "$" — key kiểu đó nằm trong
 * Mixed rất khó query và từng là đường prototype-pollution khi merge.
 */
const FLAG_KEY = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_FLAGS = 200;

/** Prototype keys — JSON cho phép gửi, merge object thì không nên nhận. */
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function IsFeatureFlags(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFeatureFlags',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return false;
          }
          const entries = Object.entries(value as Record<string, unknown>);
          if (entries.length > MAX_FLAGS) return false;
          return entries.every(
            ([key, flag]) =>
              FLAG_KEY.test(key) &&
              !RESERVED_KEYS.has(key) &&
              typeof flag === 'boolean',
          );
        },
        defaultMessage() {
          return `featureFlags phải là object tên cờ hợp lệ → boolean (tối đa ${MAX_FLAGS} cờ)`;
        },
      },
    });
  };
}

export class ForceUpdatePlatformDto {
  @ApiPropertyOptional({ example: '2.1.0' })
  @IsOptional()
  @IsString()
  @Matches(VERSION, { message: 'minVersion phải dạng 1.2.3' })
  minVersion?: string;

  @ApiPropertyOptional({ example: 'Bản cập nhật bắt buộc để tiếp tục sử dụng' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class ForceUpdateDto {
  @ApiPropertyOptional({ type: ForceUpdatePlatformDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ForceUpdatePlatformDto)
  android?: ForceUpdatePlatformDto;

  @ApiPropertyOptional({ type: ForceUpdatePlatformDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ForceUpdatePlatformDto)
  ios?: ForceUpdatePlatformDto;
}

export class AnnouncementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/**
 * PATCH chỉ sửa phần gửi lên; ValidationPipe toàn cục (whitelist +
 * forbidNonWhitelisted) từ chối key lạ thay vì bỏ qua âm thầm.
 */
export class UpdateConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  maintenanceMessage?: string;

  @ApiPropertyOptional({ type: ForceUpdateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ForceUpdateDto)
  forceUpdate?: ForceUpdateDto;

  @ApiPropertyOptional({
    description: 'Bản đồ tên cờ → bật/tắt',
    example: { chat: true, stories: false },
  })
  @IsOptional()
  @IsFeatureFlags()
  featureFlags?: Record<string, boolean>;

  @ApiPropertyOptional({ type: AnnouncementDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AnnouncementDto)
  announcement?: AnnouncementDto;
}
