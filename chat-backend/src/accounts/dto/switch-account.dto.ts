import { IsString, IsNotEmpty } from 'class-validator';

export class SwitchAccountDto {
  @IsString()
  @IsNotEmpty()
  targetAccountId: string;
}
