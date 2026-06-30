import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import {
  PERMISSIONS,
  RESULTS,
  requestMultiple,
} from 'react-native-permissions';
import ENV from '../../config/env';
import { callAudioService } from '../audio/callAudioService';

export type CallState =
  | 'idle'
  | 'initiating'
  | 'connecting'
  | 'ringing'
  | 'active'
  | 'failed'
  | 'ended';

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

/**
 * Client-side STUN fallback. The backend already prepends public STUN to the
 * ICE list, but if that payload is ever missing/empty (older server, dropped
 * field) we still want server-reflexive candidates instead of building the PC
 * with no ICE servers at all — which strands the call on host candidates only.
 */
const FALLBACK_STUN_SERVERS: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class WebRTCService {
  private socket: Socket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private listeners: Map<string, Set<WebRTCEventCallback>> = new Map();
  private iceServers: IceServerConfig[] = [];

  // ─── State Machine ──────────────────────────────────────────────────────────
  // See design.md D9. Guard transitions so concurrent events (e.g. ICE
  // restart racing with a hangup, or echoed call_offer arriving after end)
  // cannot leave the UI in an inconsistent state.
  private callState: CallState = 'idle';
  private isInitiator: boolean = false;
  private iceRestartCount: number = 0;
  private currentSessionId: string | null = null;
  // Tracked so audio routing (earpiece vs speaker) matches the call type.
  private currentCallType: 'audio' | 'video' = 'audio';

  // ICE candidates can arrive before the remote SDP is applied. addIceCandidate
  // throws if called before setRemoteDescription, so we buffer early candidates
  // and flush them once the remote description is set. Without this the first
  // few candidates are lost → flaky / one-way connect at call start.
  private remoteDescriptionSet: boolean = false;
  private pendingIceCandidates: RTCIceCandidate[] = [];

  // Caller-side: set when `call_accepted` arrives before the peer connection has
  // finished building (callee accepted faster than our getUserMedia resolved).
  // createPeerConnection() checks this and sends the deferred offer.
  private offerPending: boolean = false;

  // Callee-side twin of offerPending: the caller sends its offer immediately on
  // `call_accepted`, which can arrive (along with ICE candidates) BEFORE the
  // callee has finished getUserMedia + createPeerConnection. Without buffering,
  // handleRemoteOffer drops the offer (peerConnection still null) and the callee
  // never answers → dead air despite perfect signaling. We park the offer here
  // and replay it once createPeerConnection() finishes building.
  private pendingRemoteOffer: { sessionId: string; sdp: RTCSessionDescription } | null = null;

  private static readonly VALID_TRANSITIONS: Record<CallState, CallState[]> = {
    idle: ['initiating'],
    initiating: ['connecting', 'ended', 'failed'],
    connecting: ['ringing', 'active', 'failed', 'ended'],
    ringing: ['active', 'ended', 'failed'],
    active: ['ended', 'failed'],
    failed: ['ended'],
    ended: ['idle'],
  };

  /**
   * Attempt to move into `next`. Returns true on success, false if the
   * transition is invalid (caller can use the boolean to short-circuit).
   * Emits `call_state_changed` on success so UI hooks can react.
   */
  private transition(next: CallState): boolean {
    const allowed = WebRTCService.VALID_TRANSITIONS[this.callState];
    if (!allowed.includes(next)) {
      console.warn(
        '[WebRTC] Invalid transition:',
        this.callState,
        '→',
        next,
      );
      return false;
    }
    this.callState = next;
    this.emit('call_state_changed', next);
    return true;
  }

  getCallState(): CallState {
    return this.callState;
  }

  // ─── Socket Connection ──────────────────────────────────────────────────────

  connect(token: string): void {
    if (this.socket?.connected) return;

    this.socket = io(`${ENV.WS_URL}/webrtc`, {
      query: { token },
      // Start with polling — more reliable in RN Bridgeless mode — then
      // socket.io upgrades to websocket automatically.
      transports: ['polling', 'websocket'],
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

  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  // ─── Socket Listeners ───────────────────────────────────────────────────────

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('incoming_call', (data) => this.emit('incoming_call', data));
    this.socket.on('call_initiated', (data) => {
      // Server confirms session — capture sessionId so ICE restart can use it.
      const payload = data as { sessionId?: string } | null;
      if (payload?.sessionId) this.currentSessionId = payload.sessionId;
      this.emit('call_initiated', data);
    });
    this.socket.on('call_accepted', (data) => {
      // Caller-side: ringback was playing while waiting; switch to voice mode
      // (earpiece routing) for the actual conversation. Order matters —
      // stop ringback first so the audio session is free when start() is
      // called inside setVoiceMode.
      callAudioService.stopRingback();
      callAudioService.setVoiceMode(this.currentCallType);
      // The offer is created HERE, not at CallScreen mount. Creating it earlier
      // (while the callee is still ringing) means the callee has no peer
      // connection yet, so the offer is dropped and both sides deadlock. By the
      // time `call_accepted` fires, the callee's peer connection exists. (D7)
      if (this.isInitiator) {
        void this.sendOfferWhenReady();
      }
      this.emit('call_accepted', data);
    });
    this.socket.on('call_declined', (data) => this.emit('call_declined', data));
    this.socket.on('call_ended', (data) => this.emit('call_ended', data));
    this.socket.on('call_missed', (data) => this.emit('call_missed', data));
    // Additional terminal/state events forwarded to subscribers (Task 11).
    // IncomingCallScreen listens for call_cancelled / call_timeout to dismiss
    // itself; ChatScreen caller-side listens for call_busy.
    this.socket.on('call_ringing', (data) => this.emit('call_ringing', data));
    this.socket.on('call_cancelled', (data) => this.emit('call_cancelled', data));
    this.socket.on('call_timeout', (data) => this.emit('call_timeout', data));
    this.socket.on('call_busy', (data) => this.emit('call_busy', data));
    this.socket.on('call_failed', (data) => this.emit('call_failed', data));

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
    this.isInitiator = true;
    this.currentCallType = callType;
    this.transition('initiating');
    this.socket?.emit('call_initiate', { targetUserId, conversationId, callType });
    // Start ringback so the caller hears feedback while the callee rings.
    // Stopped on call_accepted, or in cleanup() for any terminal path.
    callAudioService.startRingback();
  }

  acceptCall(sessionId: string, callType: 'audio' | 'video' = 'audio'): void {
    this.isInitiator = false;
    this.currentSessionId = sessionId;
    this.currentCallType = callType;
    // The callee never receives `call_accepted` (the server emits that only to
    // the initiator), so route audio to the in-call session here. Without this
    // the callee's audio mode is never set → wrong routing / one-way audio.
    callAudioService.setVoiceMode(callType);
    this.socket?.emit('call_accept', { sessionId });
  }

  declineCall(sessionId: string): void {
    this.socket?.emit('call_decline', { sessionId });
  }

  endCall(sessionId: string): void {
    this.socket?.emit('call_end', { sessionId });
    this.cleanup();
  }

  cancelCall(sessionId: string): void {
    this.socket?.emit('call_cancel', { sessionId });
    this.cleanup();
  }

  emitRinging(sessionId: string): void {
    this.socket?.emit('call_ringing', { sessionId });
  }


  // ─── Media ──────────────────────────────────────────────────────────────────

  async getLocalStream(callType: 'audio' | 'video'): Promise<MediaStream> {
    // Reuse a cached stream only if it actually satisfies this call type. A
    // leftover audio-only stream (e.g. from a prior audio call that wasn't fully
    // cleaned up) has no video track, so returning it for a video call would
    // silently produce a one-way/black video with no error. Re-acquire in that
    // case; stop the stale stream first so the mic isn't held twice.
    if (this.localStream) {
      const hasVideo = this.localStream.getVideoTracks().length > 0;
      if (callType !== 'video' || hasVideo) {
        return this.localStream;
      }
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Android 6+ requires runtime permission for mic/camera. Request only
    // what's needed for the call type — audio call should not prompt for
    // camera. iOS handles permission via the Info.plist usage descriptions
    // and getUserMedia itself, so we skip the explicit check there.
    if (Platform.OS === 'android') {
      const perms =
        callType === 'video'
          ? [PERMISSIONS.ANDROID.RECORD_AUDIO, PERMISSIONS.ANDROID.CAMERA]
          : [PERMISSIONS.ANDROID.RECORD_AUDIO];
      const result = await requestMultiple(perms);
      for (const p of perms) {
        if (result[p] !== RESULTS.GRANTED) {
          throw new Error(`Permission denied: ${p}`);
        }
      }
    }

    const constraints = {
      audio: true,
      video:
        callType === 'video'
          ? {
              facingMode: 'user',
              // `ideal` lets the device negotiate down on weak links instead of
              // failing outright; frameRate cap keeps motion smooth without
              // burning uplink on a high static resolution.
              width: { ideal: 640, max: 1280 },
              height: { ideal: 480, max: 720 },
              frameRate: { ideal: 24, max: 30 },
            }
          : false,
    };

    this.localStream = await mediaDevices.getUserMedia(constraints) as MediaStream;
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * Phase 2: cap outbound bitrate and bias the encoder toward smooth motion.
   * Without a maxBitrate the encoder can spike on a good first RTT estimate and
   * then stall when the uplink can't sustain it — visible as freeze/recover
   * churn. Values are conservative for mobile uplinks; the congestion
   * controller still scales DOWN freely below these caps.
   */
  private applyEncodingParams(): void {
    if (!this.peerConnection) return;
    try {
      const senders = (
        this.peerConnection as unknown as {
          getSenders?: () => Array<{
            track?: { kind?: string } | null;
            getParameters?: () => { encodings?: unknown[] };
            setParameters?: (p: unknown) => Promise<void>;
          }>;
        }
      ).getSenders?.();
      if (!senders) return;
      for (const sender of senders) {
        const kind = sender.track?.kind;
        if (!kind || !sender.getParameters || !sender.setParameters) continue;
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        const enc = params.encodings[0] as {
          maxBitrate?: number;
          maxFramerate?: number;
        };
        if (kind === 'video') {
          enc.maxBitrate = 1_000_000; // ~1 Mbps
          enc.maxFramerate = 30;
          (params as { degradationPreference?: string }).degradationPreference =
            'maintain-framerate';
        } else if (kind === 'audio') {
          enc.maxBitrate = 32_000; // 32 kbps — plenty for Opus voice
        }
        void sender.setParameters(params).catch((err) => {
          console.warn('[WebRTC] setParameters failed:', err);
        });
      }
    } catch (err) {
      console.warn('[WebRTC] applyEncodingParams failed:', err);
    }
  }

  // ─── Peer Connection ────────────────────────────────────────────────────────

  async createPeerConnection(sessionId: string, iceServers: IceServerConfig[]): Promise<RTCPeerConnection> {
    // Guard against an empty/missing ICE list — build with public STUN rather
    // than no servers at all (host-candidate-only = dead call across any NAT).
    const effectiveIceServers =
      iceServers && iceServers.length > 0 ? iceServers : FALLBACK_STUN_SERVERS;
    this.iceServers = effectiveIceServers;
    // Fresh negotiation — reset the remote-description gate. Do NOT clear
    // pendingIceCandidates here: on the callee, ICE candidates routinely arrive
    // (and are buffered) BEFORE this PC finishes building, and wiping them would
    // drop the very host candidates that connect a same-LAN call. cleanup()
    // already empties the buffer between calls, so anything present now belongs
    // to the current negotiation and must be preserved for flush after the
    // remote description is applied.
    this.remoteDescriptionSet = false;

    const config = {
      iceServers: effectiveIceServers.map((s) => ({
        urls: s.urls,
        username: s.username,
        credential: s.credential,
      })),
      // Latency/setup tuning (Phase 2). max-bundle + rtcp-mux collapse all media
      // onto a single transport → fewer ICE checks, faster connect. Pre-gather
      // one candidate so the offer carries an ICE candidate immediately.
      iceCandidatePoolSize: 1,
      bundlePolicy: 'max-bundle' as const,
      rtcpMuxPolicy: 'require' as const,
    };

    this.peerConnection = new RTCPeerConnection(config);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
      // Apply bitrate caps + degradation preference once senders exist.
      this.applyEncodingParams();
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

    // ICE connection state — drives auto-recovery (Task 12).
    // On a transient network blip the peer connection enters 'failed';
    // we attempt up to 3 ICE restarts before declaring the call failed.
    // Counter is reset on every successful 'connected' so a long-running
    // call survives many independent blips.
    this.peerConnection.addEventListener('iceconnectionstatechange', () => {
      const state = this.peerConnection?.iceConnectionState;
      if (state === 'connected') {
        this.iceRestartCount = 0;
        return;
      }
      if (state === 'failed' && this.callState === 'active') {
        if (this.iceRestartCount < 3) {
          this.iceRestartCount += 1;
          console.log(
            '[WebRTC] ICE restart attempt',
            this.iceRestartCount,
            'for session',
            this.currentSessionId,
          );
          void (async () => {
            try {
              if (!this.peerConnection || !this.currentSessionId) return;
              const offer = await this.peerConnection.createOffer({
                iceRestart: true,
              });
              await this.peerConnection.setLocalDescription(offer);
              this.socket?.emit('call_offer', {
                sessionId: this.currentSessionId,
                sdp: offer,
              });
            } catch (err) {
              console.error('[WebRTC] ICE restart failed:', err);
            }
          })();
        } else {
          // Three strikes — give up and surface failure to peers + UI.
          // The socket emit notifies the server (→ peer gets call_ended); the
          // internal emit drives THIS device's hook into the 'failed' state
          // (the server does not echo call_failed back to us). Emit before
          // cleanup() since cleanup() nulls currentSessionId.
          this.socket?.emit('call_failed', {
            sessionId: this.currentSessionId,
          });
          this.emit('call_failed', { sessionId: this.currentSessionId });
          this.transition('failed');
          this.cleanup();
        }
      }
    });

    // If `call_accepted` already arrived while we were still acquiring media /
    // building this connection, the deferred offer was parked — send it now.
    if (this.offerPending && this.isInitiator) {
      this.offerPending = false;
      void this.createAndSendOffer(sessionId);
    }

    // Callee-side: an offer (and its ICE) may have raced ahead of this PC being
    // built. Replay the parked offer now that peerConnection exists so the
    // answer + ICE flush can proceed. handleRemoteOffer re-checks isInitiator
    // and the (now non-null) peerConnection, so this is safe.
    if (this.pendingRemoteOffer && !this.isInitiator) {
      const parked = this.pendingRemoteOffer;
      this.pendingRemoteOffer = null;
      void this.handleRemoteOffer(parked);
    }

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

  /**
   * Caller-side offer trigger, invoked on `call_accepted`. If the peer
   * connection is ready, sends the offer immediately; otherwise parks the
   * intent so createPeerConnection() can send it once setup finishes. Uses
   * currentSessionId since the accept event carries no iceServers.
   */
  private async sendOfferWhenReady(): Promise<void> {
    if (!this.currentSessionId) return;
    if (this.peerConnection) {
      await this.createAndSendOffer(this.currentSessionId);
    } else {
      this.offerPending = true;
    }
  }

  private async handleRemoteOffer(data: { sessionId: string; sdp: RTCSessionDescription }): Promise<void> {
    // The offer can arrive before the callee finished building its peer
    // connection (getUserMedia + createPeerConnection are async and the caller
    // fires its offer the instant call_accepted reaches it). Park it so
    // createPeerConnection() can replay it once the PC exists — dropping it
    // here is what caused dead-air calls despite clean signaling.
    if (!this.peerConnection) {
      if (!this.isInitiator) {
        this.pendingRemoteOffer = data;
      }
      return;
    }

    // SDP race fix (D9): Initiator side already has its local offer set —
    // an echoed `call_offer` arriving here would be one we sent ourselves
    // (server fan-out artifact). Ignoring it prevents glare and stuck
    // negotiations during ICE restart / multi-device scenarios.
    if (this.isInitiator) {
      console.warn(
        '[WebRTC] Ignoring echoed offer on initiator side for session',
        data.sessionId,
      );
      return;
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    await this.flushPendingIceCandidates();
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.socket?.emit('call_answer', { sessionId: data.sessionId, sdp: answer });
    this.emit('call_offer', data);
  }

  private async handleRemoteAnswer(data: { sessionId: string; sdp: RTCSessionDescription }): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    await this.flushPendingIceCandidates();
  }

  private async handleRemoteIceCandidate(data: { candidate: RTCIceCandidate }): Promise<void> {
    const candidate = new RTCIceCandidate(data.candidate);
    // Buffer until BOTH the peer connection exists AND the remote description
    // is set. Candidates routinely arrive before either is ready on the callee
    // (the caller trickles ICE the instant it sends its offer). addIceCandidate
    // throws without a remote description, and there's nothing to add it to
    // without a PC — so a dropped candidate can leave the connection half-open.
    // flushPendingIceCandidates() replays these once handleRemoteOffer applies
    // the remote description.
    if (!this.peerConnection || !this.remoteDescriptionSet) {
      this.pendingIceCandidates.push(candidate);
      return;
    }
    try {
      await this.peerConnection.addIceCandidate(candidate);
    } catch (err) {
      console.error('[WebRTC] Failed to add ICE candidate:', err);
    }
  }

  /**
   * Apply any ICE candidates that arrived before the remote description was
   * set. Marks the gate open so subsequent candidates apply immediately.
   */
  private async flushPendingIceCandidates(): Promise<void> {
    this.remoteDescriptionSet = true;
    if (!this.peerConnection || this.pendingIceCandidates.length === 0) return;
    const queued = this.pendingIceCandidates;
    this.pendingIceCandidates = [];
    for (const candidate of queued) {
      try {
        await this.peerConnection.addIceCandidate(candidate);
      } catch (err) {
        console.error('[WebRTC] Failed to add queued ICE candidate:', err);
      }
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  cleanup(): void {
    // Stop all audio first — ringback, ringtone, vibration, and any active
    // InCallManager session. Safe to call even if nothing is playing.
    callAudioService.stop();
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    // Reset state-machine fields. Transition through 'ended' → 'idle' so any
    // subscribers see the call closing rather than vanishing silently.
    this.isInitiator = false;
    this.iceRestartCount = 0;
    this.currentSessionId = null;
    this.currentCallType = 'audio';
    this.remoteDescriptionSet = false;
    this.pendingIceCandidates = [];
    this.offerPending = false;
    this.pendingRemoteOffer = null;
    // Walk the state machine down to 'idle' only if a call was actually in
    // progress. Calling cleanup() while already 'idle' (defensive cleanup on
    // unmount / disconnect / logout with no active call) is a no-op — avoids
    // the spurious "Invalid transition: idle → ended" warnings.
    if (this.callState !== 'idle') {
      if (this.callState !== 'ended') {
        this.transition('ended');
      }
      this.transition('idle');
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

  switchCamera(): void {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0] as
      | { _switchCamera?: () => void }
      | undefined;
    try {
      videoTrack?._switchCamera?.();
    } catch (err) {
      console.warn('[WebRTC] switchCamera failed:', err);
    }
  }
}

export const webrtcService = new WebRTCService();
export default webrtcService;