import { IsNotEmpty, IsString, Length } from 'class-validator';

export class EnableTwoFactorDto {
  @IsString()
  @Length(6, 6, { message: '2FA code must be exactly 6 digits' })
  code: string;
}

/** Disable chấp nhận mã TOTP 6 số hoặc một recovery code. */
export class DisableTwoFactorDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}
