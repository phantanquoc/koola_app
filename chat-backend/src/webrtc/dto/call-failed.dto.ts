import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CallFailedDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
