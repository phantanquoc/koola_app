import { IsEmail, IsIn, IsNotEmpty } from 'class-validator';

export class CreateInviteDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsIn(['admin', 'editor', 'viewer'])
  @IsNotEmpty()
  role: string;
}
