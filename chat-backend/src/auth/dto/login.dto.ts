import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  /** Mã TOTP 6 số hoặc recovery code — chỉ bắt buộc khi tài khoản đã bật 2FA. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  twoFactorCode?: string;
}
