import { IsString, IsNotEmpty } from 'class-validator';

export class CallAnswerDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  sdp!: string;
}
