import { IsEmail, IsString, Length } from 'class-validator';

export class ResetPasswordVerifyDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}
