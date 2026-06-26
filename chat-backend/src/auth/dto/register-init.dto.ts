import { IsString, IsNotEmpty, MinLength, IsEmail } from 'class-validator';

export class RegisterInitDto {
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
