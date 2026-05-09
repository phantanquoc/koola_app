import { IsString, IsNotEmpty } from 'class-validator';

export class CallRingingDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}
