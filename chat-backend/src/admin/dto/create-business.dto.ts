import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsVnPhone, NormalizeVnPhone } from '../../common/utils/vn-phone.validator';

/** Slug danh mục hợp lệ — hợp nhất tập của admin và mobile (ChatApp/src/screens/connect/constants.ts). */
export const BUSINESS_CATEGORIES = [
  'food-beverage',
  'retail',
  'finance',
  'education',
  'real-estate',
  'technology',
  'manufacturing',
  'healthcare',
  'logistics',
  'hospitality',
  'fashion',
  'services',
  // Có trong DB thật và trong form đăng ký mobile — admin phải filter/sửa được
  'domestic-supplier',
  'raw-materials',
  'packaging',
  'other',
] as const;

/** SĐT Việt Nam: 10 số bắt đầu bằng 0, hoặc +84 theo sau 9 số. */

export class CreateBusinessDto {
  @ApiProperty({ example: 'Công ty TNHH Koola' })
  @IsString()
  @MinLength(2, { message: 'Tên doanh nghiệp phải có ít nhất 2 ký tự' })
  @MaxLength(120)
  displayName: string;

  @ApiPropertyOptional({ example: 'contact@koola.vn' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  contactEmail?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @NormalizeVnPhone()
  @IsVnPhone()
  contactPhone?: string;

  @ApiPropertyOptional({ enum: BUSINESS_CATEGORIES })
  @IsOptional()
  @IsIn(BUSINESS_CATEGORIES as unknown as string[], {
    message: 'Danh mục không hợp lệ',
  })
  businessCategory?: string;

  @ApiPropertyOptional({ example: 'Hà Nội' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  province?: string;

  @ApiPropertyOptional({ example: 'Số 1 Tràng Tiền, Hoàn Kiếm' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: '0101234567' })
  @IsOptional()
  @Matches(/^\d{10}(?:\d{3})?$/, {
    message: 'Mã số thuế phải là 10 hoặc 13 chữ số',
  })
  taxCode?: string;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Ngày hết hạn giấy phép phải theo dạng YYYY-MM-DD',
  })
  licenseExpiresAt?: string;

  @ApiPropertyOptional({ example: 'Khách hàng doanh nghiệp, ưu tiên duyệt' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;
}
