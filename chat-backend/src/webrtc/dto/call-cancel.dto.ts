import { IsString, IsNotEmpty } from 'class-validator';

export class CallCancelDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}
