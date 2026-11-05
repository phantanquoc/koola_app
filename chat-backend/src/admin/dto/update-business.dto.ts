import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsVnPhone, NormalizeVnPhone } from '../../common/utils/vn-phone.validator';
import { BUSINESS_CATEGORIES } from './create-business.dto';

/** SĐT Việt Nam — đồng bộ với CreateBusinessDto. */
const TAX_CODE = /^\d{10}(?:\d{3})?$/;
/** Chấp nhận YYYY-MM-DD (input date) hoặc ISO datetime đầy đủ. */
const DATE_INPUT = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/;

/**
 * PATCH hồ sơ doanh nghiệp. Mọi field optional; ValidationPipe
 * (whitelist + forbidNonWhitelisted) từ chối key lạ với 400 thay vì bỏ qua
 * âm thầm như khi route còn nhận `Record<string, unknown>`.
 *
 * Không bao gồm verificationStatus / isBanned / suspended — các field đó đi
 * qua endpoint riêng để luôn kèm audit + side effect (syncSellers).
 */
export class UpdateBusinessDto {
  @ApiPropertyOptional({ example: 'Công ty TNHH Koola' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Tên doanh nghiệp phải có ít nhất 2 ký tự' })
  @MaxLength(120)
  displayName?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @NormalizeVnPhone()
  @IsVnPhone()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(TAX_CODE, { message: 'Mã số thuế phải là 10 hoặc 13 chữ số' })
  taxCode?: string;

  /**
   * Ngày hết hạn giấy phép. Gửi chuỗi rỗng để XOÁ ngày (service $unset) —
   * trước đây gửi '' làm Mongoose CastError → 500.
   */
  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @Matches(DATE_INPUT, {
    message: 'Ngày hết hạn giấy phép phải theo dạng YYYY-MM-DD',
  })
  licenseExpiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignee?: string;

  /**
   * Tỉ lệ hoa hồng nền tảng (0..1). Vào bảng đối soát doanh thu; chỉ đổi được
   * qua route này nên luôn kèm audit `update_business`.
   */
  @ApiPropertyOptional({ example: 0.1, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  commissionRate?: number;
}
