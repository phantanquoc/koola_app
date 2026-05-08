import {
  IsString,
  IsNotEmpty,
  MinLength,
  Matches,
  IsEmail,
} from 'class-validator';

export class RegisterInitDto {
  @Matches(/^\+84[0-9]{9,10}$/, {
    message:
      'Phone must be a valid Vietnam number (+84 followed by 9-10 digits)',
  })
  @IsNotEmpty()
  phone: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  displayName: string;
}
