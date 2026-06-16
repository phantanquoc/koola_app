/**
 * jest/mocks/react-native-webrtc.js
 *
 * Loopback mock for react-native-webrtc. Purpose: allow WebRTCService unit
 * tests to run on Node without a real device or native bridge.
 *
 * DESIGN (loopback):
 * - RTCPeerConnection fires a fake 'track' event (with a synthetic remote
 *   MediaStream) after setRemoteDescription succeeds. This simulates the
 *   remote peer sending a media track, which is what causes both sides to
 *   reach 'active' in a real call.
 * - createOffer returns the string 'sdp-offer'; createAnswer returns
 *   'sdp-answer'. These are plain strings (matching CallOfferDto / CallAnswerDto
 *   which use @IsString) rather than RTCSessionDescription objects so the mock
 *   does not need to replicate the full SDP schema.
 * - icecandidate fires one synthetic candidate when setLocalDescription runs,
 *   simulating the ICE gathering phase.
 * - No two-PC cross-wiring is done here. Tests drive the relay manually via
 *   callHarness.ts which passes SDP/ICE between two independent service instances.
 */

'use strict';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTrack(kind) {
  return {
    kind,
    enabled: true,
    stop: jest.fn(),
    _switchCamera: jest.fn(),
  };
}

function makeMediaStream(hasVideo) {
  const audioTrack = makeTrack('audio');
  const videoTrack = hasVideo ? makeTrack('video') : null;
  const allTracks = hasVideo ? [audioTrack, videoTrack] : [audioTrack];

  return {
    _id: `stream-${Math.random().toString(36).slice(2)}`,
    toURL: () => 'mock-stream-url',
    getTracks: () => allTracks.filter(Boolean),
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => (videoTrack ? [videoTrack] : []),
  };
}

// ─── RTCPeerConnection (loopback) ─────────────────────────────────────────────

class RTCPeerConnection {
  constructor(_config) {
    this._listeners = {};
    this.localDescription = null;
    this.remoteDescription = null;
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this._remoteDescriptionSet = false;
    // Use jest.fn() so tests can assert call counts on addIceCandidate
    this.addIceCandidate = jest.fn().mockResolvedValue(undefined);
  }

  addEventListener(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }

  _fire(event, data) {
    (this._listeners[event] || []).forEach((h) => h(data));
  }

  addTrack(_track, _stream) {
    // no-op — tracks added to local stream; remote stream arrives via 'track'
  }

  async createOffer(_options) {
    return 'sdp-offer';
  }

  async createAnswer(_options) {
    return 'sdp-answer';
  }

  async setLocalDescription(sdp) {
    this.localDescription = sdp;
    // Fire a synthetic ICE candidate to simulate gathering
    queueMicrotask(() => {
      this._fire('icecandidate', {
        candidate: {
          candidate: 'candidate:mock 1 UDP 2122252543 127.0.0.1 50000 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      });
    });
  }

  async setRemoteDescription(sdp) {
    this.remoteDescription = sdp;
    this._remoteDescriptionSet = true;
    // Simulate the remote track arriving after the remote description is set.
    // This is what causes useWebRTC's handleRemoteStream to fire and set the
    // call state to 'active'.
    queueMicrotask(() => {
      const remoteStream = makeMediaStream(false);
      this._fire('track', { streams: [remoteStream] });
    });
  }

  async addIceCandidate(_candidate) {
    // Replaced by jest.fn() in constructor — this method is not called
    void _candidate;
  }

  close() {
    this.connectionState = 'closed';
    this._fire('connectionstatechange', undefined);
  }
}

// ─── RTCSessionDescription ────────────────────────────────────────────────────

class RTCSessionDescription {
  constructor(init) {
    this.type = (init && init.type) || 'offer';
    this.sdp = (init && init.sdp) || (init && typeof init === 'string' ? init : 'sdp-mock');
  }
}

// ─── RTCIceCandidate ──────────────────────────────────────────────────────────

class RTCIceCandidate {
  constructor(init) {
    this.candidate = (init && init.candidate) || '';
    this.sdpMid = (init && init.sdpMid) || null;
    this.sdpMLineIndex = (init && init.sdpMLineIndex) || null;
  }
}

// ─── mediaDevices ─────────────────────────────────────────────────────────────

const mediaDevices = {
  getUserMedia: jest.fn(async (constraints) => {
    const hasVideo = !!(constraints && constraints.video);
    return makeMediaStream(hasVideo);
  }),
};

// ─── MediaStream ──────────────────────────────────────────────────────────────

class MediaStream {
  constructor() {
    const audioTrack = makeTrack('audio');
    this._tracks = [audioTrack];
    this._id = `stream-${Math.random().toString(36).slice(2)}`;
  }

  toURL() {
    return 'mock-stream-url';
  }

  getTracks() {
    return this._tracks;
  }

  getAudioTracks() {
    return this._tracks.filter((t) => t.kind === 'audio');
  }

  getVideoTracks() {
    return this._tracks.filter((t) => t.kind === 'video');
  }
}

module.exports = {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
};
