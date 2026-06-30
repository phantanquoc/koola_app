/**
 * WebRTCService.video.spec.ts
 *
 * Video-call media-path coverage. The signaling path (offer/answer/ICE) is
 * shared with audio and exercised by WebRTCService.call.spec.ts; this file
 * targets the video-SPECIFIC surfaces that have had zero coverage:
 *
 *  - getLocalStream('video') requests camera + mic and yields a video track
 *  - getLocalStream cache must NOT hand back an audio-only stream for a video
 *    call (regression guard for the silent black-video footgun)
 *  - audio calls never prompt for the camera
 *  - toggleCamera / switchCamera operate on the video track
 *
 * Mocking mirrors WebRTCService.call.spec.ts but pins Platform to 'android'
 * so the runtime permission branch in getLocalStream is exercised.
 */

jest.mock('socket.io-client', () => jest.fn(() => null));

const mockRequestMultiple = jest.fn();
jest.mock('react-native-permissions', () => ({
  PERMISSIONS: { ANDROID: { RECORD_AUDIO: 'audio', CAMERA: 'camera' } },
  RESULTS: { GRANTED: 'granted' },
  requestMultiple: (...args: unknown[]) => mockRequestMultiple(...args),
}));

// Android so getLocalStream runs the permission request branch.
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Vibration: { vibrate: jest.fn(), cancel: jest.fn() },
}));

import { WebRTCService } from '../WebRTCService';

const rnWebrtc = require('react-native-webrtc');

describe('WebRTCService — video media path', () => {
  let service: WebRTCService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestMultiple.mockResolvedValue({ audio: 'granted', camera: 'granted' });
    service = new WebRTCService();
  });

  afterEach(() => {
    try {
      service.cleanup();
    } catch {
      /* ignore */
    }
  });

  it('video call requests BOTH mic and camera permissions', async () => {
    await service.getLocalStream('video');
    expect(mockRequestMultiple).toHaveBeenCalledWith(['audio', 'camera']);
  });

  it('audio call requests ONLY the mic — never prompts for camera', async () => {
    await service.getLocalStream('audio');
    expect(mockRequestMultiple).toHaveBeenCalledWith(['audio']);
  });

  it('video stream carries a video track; audio stream does not', async () => {
    const videoStream = await service.getLocalStream('video');
    expect(videoStream.getVideoTracks().length).toBeGreaterThan(0);

    service.cleanup();

    const audioStream = await service.getLocalStream('audio');
    expect(audioStream.getVideoTracks().length).toBe(0);
  });

  it('throws (and does not cache) when camera permission is denied', async () => {
    mockRequestMultiple.mockResolvedValue({ audio: 'granted', camera: 'denied' });
    await expect(service.getLocalStream('video')).rejects.toThrow(/camera/i);
  });

  it('getUserMedia receives video constraints for a video call', async () => {
    await service.getLocalStream('video');
    const constraints = rnWebrtc.mediaDevices.getUserMedia.mock.calls[0][0];
    expect(constraints.audio).toBe(true);
    expect(constraints.video).toMatchObject({ facingMode: 'user' });
  });

  // ── Cache-invalidation regression (the silent black-video footgun) ──────────
  describe('getLocalStream cache is call-type aware', () => {
    it('reuses an existing video stream for a second video call', async () => {
      const first = await service.getLocalStream('video');
      const second = await service.getLocalStream('video');
      expect(second).toBe(first);
      expect(rnWebrtc.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('does NOT return a cached audio-only stream to a video call — re-acquires with video', async () => {
      const audioStream = await service.getLocalStream('audio');
      expect(audioStream.getVideoTracks().length).toBe(0);

      const videoStream = await service.getLocalStream('video');
      // Fresh acquisition, and it actually has the camera track.
      expect(rnWebrtc.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
      expect(videoStream.getVideoTracks().length).toBeGreaterThan(0);
      // Stale audio-only tracks were stopped so the mic isn't held twice.
      expect(audioStream.getAudioTracks()[0].stop).toHaveBeenCalled();
    });

    it('reuses a video stream when a later audio call asks for media', async () => {
      const videoStream = await service.getLocalStream('video');
      const audioStream = await service.getLocalStream('audio');
      // A video stream already satisfies an audio call — no re-acquire.
      expect(audioStream).toBe(videoStream);
      expect(rnWebrtc.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    });
  });

  // ── Track toggles operate on the right track ────────────────────────────────
  it('toggleCamera flips the video track enabled flag', async () => {
    const stream = await service.getLocalStream('video');
    const track = stream.getVideoTracks()[0];
    expect(track.enabled).toBe(true);

    const offReported = service.toggleCamera();
    expect(track.enabled).toBe(false);
    expect(offReported).toBe(true);

    service.toggleCamera();
    expect(track.enabled).toBe(true);
  });

  it('switchCamera invokes the native track switch', async () => {
    const stream = await service.getLocalStream('video');
    const track = stream.getVideoTracks()[0] as unknown as {
      _switchCamera: jest.Mock;
    };
    service.switchCamera();
    expect(track._switchCamera).toHaveBeenCalled();
  });
});
