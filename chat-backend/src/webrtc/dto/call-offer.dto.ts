import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class CallOfferDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  // SDP is the RTCSessionDescription object { type, sdp } emitted verbatim by
  // the client — NOT a string. The backend only relays it, so validate that it
  // is a non-empty object and pass it through untouched. (Was @IsString(),
  // which silently rejected every real offer at the ValidationPipe → callee
  // never received it → calls stuck on "connecting".)
  @IsObject()
  @IsNotEmpty()
  sdp!: { type: string; sdp: string };
}
