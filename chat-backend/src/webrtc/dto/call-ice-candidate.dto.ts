import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class CallIceCandidateDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  // RTCIceCandidate object { candidate, sdpMid, sdpMLineIndex } emitted by the
  // client — relayed verbatim. See CallOfferDto for why this is @IsObject().
  @IsObject()
  @IsNotEmpty()
  candidate!: Record<string, unknown>;
}
