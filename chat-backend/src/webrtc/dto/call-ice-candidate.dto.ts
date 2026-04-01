import { IsString, IsNotEmpty } from 'class-validator';

export class CallIceCandidateDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  candidate!: string;
}
