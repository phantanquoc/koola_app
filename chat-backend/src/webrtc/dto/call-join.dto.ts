import { IsString, IsNotEmpty } from 'class-validator';

export class CallJoinDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}
