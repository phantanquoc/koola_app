/**
 * WebRTCService — manages the /webrtc Socket.io namespace and RTCPeerConnection lifecycle.
 * Separate from SocketService which handles /chat namespace.
 */
import { io, Socket } from 'socket.io-client';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import { WEBRTC_WS_URL } from '../../config/env';
import { getAccessToken } from '../../utils/apiClient';

export interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

export interface CallSession {
  sessionId: string;
  callType: 'audio' | 'video';
  isInitiator: boolean;
  remoteUserId?: string;
  remoteUser?: { _id: string; displayName: string; avatar?: string };
  conversationId?: string;
}

export type CallState =
  | 'idle'
  | 'initiating'
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'ended';

type WebRTCEventHandler = (data: any) => void;

class WebRTCService {
  private socket: Socket | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private iceServers: IceServer[] = [];
  private listeners: Map<string, Set<WebRTCEventHandler>> = new Map();

  // ── Socket connection ────────────────────────────────────────────────────────

  connect(): void {
    if (this.socket?.connected) return;

    const token = getAccessToken();
    if (!token) return;

    this.socket = io(WEBRTC_WS_URL, {
      query: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('[WebRTC Socket] Connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WebRTC Socket] Disconnected:', reason);
    });

    // Re-attach stored listeners on reconnect
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((cb) => this.socket?.on(event, cb));
    });
  }

  disconnect(): void {
    this.cleanup();
    this.socket?.disconnect();
    this.socket = null;
  }

  on(event: string, callback: WebRTCEventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: WebRTCEventHandler): void {
    if (callback) {
      this.listeners.get(event)?.delete(callback);
      this.socket?.off(event, callback);
    } else {
      this.listeners.delete(event);
      this.socket?.off(event);
    }
  }

  emit(event: string, data?: any): void {
    this.socket?.emit(event, data);
  }

  // ── Call initiation ──────────────────────────────────────────────────────────

  initiateCall(targetUserId: string, conversationId: string, callType: 'audio' | 'video'): void {
    this.emit('call_initiate', { targetUserId, conversationId, callType });
  }

  acceptCall(sessionId: string): void {
    this.emit('call_accept', { sessionId });
  }

  declineCall(sessionId: string): void {
    this.emit('call_decline', { sessionId });
  }

  endCall(sessionId: string): void {
    this.emit('call_end', { sessionId });
    this.cleanup();
  }

  // ── Media ────────────────────────────────────────────────────────────────────

  async getLocalStream(callType: 'audio' | 'video'): Promise<MediaStream> {
    const constraints = {
      audio: true,
      video: callType === 'video' ? { facingMode: 'user', width: 640, height: 480 } : false,
    };

    const stream = await mediaDevices.getUserMedia(constraints);
    this.localStream = stream as MediaStream;
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // true = muted
    }
    return false;
  }

  toggleCamera(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled; // true = camera off
    }
    return false;
  }

  toggleSpeaker(): void {
    // Speaker toggle is handled natively — no-op placeholder
  }

  // ── RTCPeerConnection lifecycle ─────────────────────────────────────────────

  async createPeerConnection(
    iceServers: IceServer[],
    sessionId: string,
    onRemoteStream: (stream: MediaStream) => void,
  ): Promise<RTCPeerConnection> {
    this.iceServers = iceServers;

    this.pc = new RTCPeerConnection({ iceServers });

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.pc?.addTrack(track, this.localStream!);
      });
    }

    // ICE candidates → emit to server
    this.pc.addEventListener('icecandidate', (event: any) => {
      if (event.candidate) {
        this.emit('call_ice_candidate', {
          sessionId,
          candidate: event.candidate,
        });
      }
    });

    // Remote stream
    this.pc.addEventListener('track', (event: any) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0] as MediaStream;
        onRemoteStream(this.remoteStream);
      }
    });

    this.pc.addEventListener('iceconnectionstatechange', () => {
      console.log('[WebRTC] ICE state:', this.pc?.iceConnectionState);
    });

    return this.pc;
  }

  async createOffer(sessionId: string): Promise<void> {
    if (!this.pc) return;
    const offer = await this.pc.createOffer({});
    await this.pc.setLocalDescription(offer);
    this.emit('call_offer', {
      sessionId,
      sdp: offer,
    });
  }

  async handleRemoteOffer(sdp: RTCSessionDescription, sessionId: string): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.emit('call_answer', {
      sessionId,
      sdp: answer,
    });
  }

  async handleRemoteAnswer(sdp: RTCSessionDescription): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  async handleRemoteIceCandidate(candidate: any): Promise<void> {
    if (!this.pc) return;
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  cleanup(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.remoteStream = null;

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}

export const webrtcService = new WebRTCService();
