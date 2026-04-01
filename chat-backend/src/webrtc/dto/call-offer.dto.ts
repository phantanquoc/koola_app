import { IsString, IsNotEmpty } from 'class-validator';

export class CallOfferDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  sdp!: string;
}
