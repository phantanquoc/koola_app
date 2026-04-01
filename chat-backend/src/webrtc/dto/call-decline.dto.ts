import { IsString, IsNotEmpty } from 'class-validator';

export class CallDeclineDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}
