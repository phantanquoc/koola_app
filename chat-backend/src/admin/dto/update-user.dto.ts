import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsVnPhone, NormalizeVnPhone } from '../../common/utils/vn-phone.validator';

/** Đồng bộ với UsersService.updateProfile + UpdateProfileDto của app. */
const USERNAME = /^[a-zA-Z0-9_]{3,30}$/;

/**
 * PATCH tài khoản từ trang quản trị.
 *
 * Chỉ những field mà moderator thật sự cần sửa khi hỗ trợ người dùng: tên hiển
 * thị sai chính tả / phản cảm, email-đăng-nhập gõ nhầm lúc đăng ký, SĐT sai,
 * username trùng, plus ghi chú nội bộ. KHÔNG có `accountType`, `isBanned`,
 * `isPlatformAdmin`, `passwordHash` — ba cái đầu đi qua endpoint riêng (mỗi cái
 * có audit + side effect riêng), mật khẩu thì admin không được biết.
 *
 * Whitelist + forbidNonWhitelisted của ValidationPipe biến key lạ thành 400
 * thay vì bỏ qua âm thầm.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn An' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Tên hiển thị không được để trống' })
  @MaxLength(80)
  displayName?: string;

  @ApiPropertyOptional({ example: 'nguyenvanan' })
  @IsOptional()
  @IsString()
  @Matches(USERNAME, {
    message: 'Tên đăng nhập chỉ gồm chữ, số, gạch dưới và dài 3–30 ký tự',
  })
  username?: string;

  @ApiPropertyOptional({ example: 'an@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @NormalizeVnPhone()
  @IsVnPhone()
  phone?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;

  @ApiPropertyOptional({ description: 'Ghi chú nội bộ — chỉ admin đọc được' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;

  /**
   * Vai trò trong khu admin. `null`/bỏ trống = super (admin cũ). Chỉ super
   * được đổi — chặn ở controller để moderator không tự nâng quyền.
   */
  @ApiPropertyOptional({
    enum: ['super', 'moderator', 'support'],
    description: 'Chỉ super được đổi vai trò quản trị',
  })
  @IsOptional()
  @IsIn(['super', 'moderator', 'support'])
  adminRole?: 'super' | 'moderator' | 'support';
}
