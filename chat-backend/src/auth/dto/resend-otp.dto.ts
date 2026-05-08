import { IsNotEmpty, IsEmail } from 'class-validator';

export class ResendOtpDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty()
  email: string;
}
