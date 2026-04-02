import { io, Socket } from 'socket.io-client';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import ENV from '../../config/env';

export type CallState = 'idle' | 'initiating' | 'ringing' | 'active' | 'ended';

export interface CallInfo {
  sessionId: string;
  callType: 'audio' | 'video';
  isInitiator: boolean;
  remoteUserId: string;
  remoteUser?: { userId: string; displayName: string; avatar?: string };
}

export interface IceServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

type WebRTCEventCallback = (...args: unknown[]) => void;

class WebRTCService {
  private socket: Socket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private listeners: Map<string, Set<WebRTCEventCallback>> = new Map();
  private iceServers: IceServerConfig[] = [];

  // ─── Socket Connection ──────────────────────────────────────────────────────

  connect(token: string): void {
    if (this.socket?.connected) return;

    this.socket = io(`${ENV.WS_URL}/webrtc`, {
      query: { token },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('[WebRTC] Socket connected');
    });

    this.setupSocketListeners();
  }

  disconnect(): void {
    this.cleanup();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // ─── Socket Listeners ───────────────────────────────────────────────────────

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('incoming_call', (data) => this.emit('incoming_call', data));
    this.socket.on('call_initiated', (data) => this.emit('call_initiated', data));
    this.socket.on('call_accepted', (data) => this.emit('call_accepted', data));
    this.socket.on('call_declined', (data) => this.emit('call_declined', data));
    this.socket.on('call_ended', (data) => this.emit('call_ended', data));
    this.socket.on('call_missed', (data) => this.emit('call_missed', data));

    this.socket.on('call_offer', async (data) => {
      await this.handleRemoteOffer(data);
    });
    this.socket.on('call_answer', async (data) => {
      await this.handleRemoteAnswer(data);
    });
    this.socket.on('call_ice_candidate', async (data) => {
      await this.handleRemoteIceCandidate(data);
    });

    this.socket.on('error', (data) => this.emit('error', data));
  }

  // ─── Event Emitter ──────────────────────────────────────────────────────────

  on(event: string, callback: WebRTCEventCallback): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: WebRTCEventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((cb) => cb(...args));
  }

  // ─── Call Actions ───────────────────────────────────────────────────────────

  initiateCall(targetUserId: string, conversationId: string, callType: 'audio' | 'video'): void {
    this.socket?.emit('call_initiate', { targetUserId, conversationId, callType });
  }

  acceptCall(sessionId: string): void {
    this.socket?.emit('call_accept', { sessionId });
  }

  declineCall(sessionId: string): void {
    this.socket?.emit('call_decline', { sessionId });
  }

  endCall(sessionId: string): void {
    this.socket?.emit('call_end', { sessionId });
    this.cleanup();
  }


  // ─── Media ──────────────────────────────────────────────────────────────────

  async getLocalStream(callType: 'audio' | 'video'): Promise<MediaStream> {
    if (this.localStream) return this.localStream;

    const constraints = {
      audio: true,
      video: callType === 'video' ? { facingMode: 'user', width: 640, height: 480 } : false,
    };

    this.localStream = await mediaDevices.getUserMedia(constraints) as MediaStream;
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  // ─── Peer Connection ────────────────────────────────────────────────────────

  async createPeerConnection(sessionId: string, iceServers: IceServerConfig[]): Promise<RTCPeerConnection> {
    this.iceServers = iceServers;

    const config = {
      iceServers: iceServers.map((s) => ({
        urls: s.urls,
        username: s.username,
        credential: s.credential,
      })),
    };

    this.peerConnection = new RTCPeerConnection(config);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    // ICE candidates
    this.peerConnection.addEventListener('icecandidate', (event: { candidate: RTCIceCandidate | null }) => {
      if (event.candidate) {
        this.socket?.emit('call_ice_candidate', {
          sessionId,
          candidate: event.candidate,
        });
      }
    });

    // Remote stream
    this.peerConnection.addEventListener('track', (event: { streams: MediaStream[] }) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.emit('remote_stream', this.remoteStream);
      }
    });

    // Connection state
    this.peerConnection.addEventListener('connectionstatechange', () => {
      const state = this.peerConnection?.connectionState;
      this.emit('connection_state', state);
      if (state === 'failed' || state === 'disconnected') {
        this.emit('peer_disconnected');
      }
    });

    return this.peerConnection;
  }

  // ─── SDP Exchange ───────────────────────────────────────────────────────────

  async createAndSendOffer(sessionId: string): Promise<void> {
    if (!this.peerConnection) return;

    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await this.peerConnection.setLocalDescription(offer);

    this.socket?.emit('call_offer', { sessionId, sdp: offer });
  }

  private async handleRemoteOffer(data: { sessionId: string; sdp: RTCSessionDescription }): Promise<void> {
    if (!this.peerConnection) return;

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.socket?.emit('call_answer', { sessionId: data.sessionId, sdp: answer });
    this.emit('call_offer', data);
  }

  private async handleRemoteAnswer(data: { sessionId: string; sdp: RTCSessionDescription }): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
  }

  private async handleRemoteIceCandidate(data: { candidate: RTCIceCandidate }): Promise<void> {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error('[WebRTC] Failed to add ICE candidate:', err);
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  cleanup(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }

  // ─── Mute/Camera Toggle ─────────────────────────────────────────────────────

  toggleMute(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled;
    }
    return false;
  }

  toggleCamera(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled;
    }
    return false;
  }
}

export const webrtcService = new WebRTCService();
export default webrtcService;