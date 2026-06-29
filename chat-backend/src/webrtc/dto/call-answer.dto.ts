import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class CallAnswerDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  // RTCSessionDescription object { type, sdp } — relayed verbatim. See
  // CallOfferDto for why this is @IsObject() and not @IsString().
  @IsObject()
  @IsNotEmpty()
  sdp!: { type: string; sdp: string };
}
