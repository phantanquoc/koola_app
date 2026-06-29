import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CallOfferDto } from './call-offer.dto';
import { CallAnswerDto } from './call-answer.dto';
import { CallIceCandidateDto } from './call-ice-candidate.dto';

/**
 * Regression guard for the "calls stuck on connecting" bug: the DTOs declared
 * `sdp`/`candidate` as @IsString(), but react-native-webrtc emits them as
 * RTCSessionDescription / RTCIceCandidate OBJECTS. The ValidationPipe rejected
 * every real offer/answer/ICE silently, so the callee never saw the offer.
 *
 * These tests exercise the SAME validation the WS ValidationPipe runs (the
 * gateway specs call handlers directly and bypass it), proving the object
 * payload now validates and a stringified one would have been rejected.
 */
describe('WebRTC signaling DTOs (ValidationPipe path)', () => {
  it('CallOfferDto accepts the RTCSessionDescription object the client sends', async () => {
    const dto = plainToInstance(CallOfferDto, {
      sessionId: 'sess-1',
      sdp: { type: 'offer', sdp: 'v=0...' },
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CallOfferDto rejects a stringified sdp (the old broken client shape)', async () => {
    const dto = plainToInstance(CallOfferDto, {
      sessionId: 'sess-1',
      sdp: 'v=0...',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'sdp')).toBe(true);
  });

  it('CallAnswerDto accepts the RTCSessionDescription object', async () => {
    const dto = plainToInstance(CallAnswerDto, {
      sessionId: 'sess-1',
      sdp: { type: 'answer', sdp: 'v=0...' },
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CallIceCandidateDto accepts the RTCIceCandidate object', async () => {
    const dto = plainToInstance(CallIceCandidateDto, {
      sessionId: 'sess-1',
      candidate: { candidate: 'candidate:...', sdpMid: '0', sdpMLineIndex: 0 },
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('DTOs still require a non-empty sessionId', async () => {
    const dto = plainToInstance(CallOfferDto, {
      sessionId: '',
      sdp: { type: 'offer', sdp: 'v=0...' },
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'sessionId')).toBe(true);
  });
});
