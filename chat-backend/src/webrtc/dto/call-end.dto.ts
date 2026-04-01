import { IsString, IsNotEmpty } from 'class-validator';

export class CallEndDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}
