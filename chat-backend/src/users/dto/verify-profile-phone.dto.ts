import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RequestProfilePhoneOtpDto {
  @ApiProperty({ description: 'Vietnam phone number in E.164 format (+84...)' })
  @IsString()
  @Matches(/^\+84\d{9,10}$/, {
    message: 'Số điện thoại phải bắt đầu bằng +84 và có 9-10 chữ số',
  })
  phone: string;
}

export class VerifyProfilePhoneOtpDto {
  @ApiProperty({ description: 'Vietnam phone number in E.164 format (+84...)' })
  @IsString()
  @Matches(/^\+84\d{9,10}$/, {
    message: 'Số điện thoại phải bắt đầu bằng +84 và có 9-10 chữ số',
  })
  phone: string;

  @ApiProperty({ description: '6-digit OTP code' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã xác thực phải là 6 chữ số' })
  code: string;
}
