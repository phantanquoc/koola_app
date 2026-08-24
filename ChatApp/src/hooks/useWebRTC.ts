import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { webrtcService, CallState, IceServerConfig } from '../services/webrtc/WebRTCService';
import { callAudioService } from '../services/audio/callAudioService';
import { MediaStream } from 'react-native-webrtc';

interface UseWebRTCParams {
  sessionId: string;
  callType: 'audio' | 'video';
  isInitiator: boolean;
  iceServers?: IceServerConfig[];
  onCallEnded?: () => void;
}

export function useWebRTC(params: UseWebRTCParams) {
  const { sessionId, callType, isInitiator, iceServers = [], onCallEnded } = params;
  const [callState, setCallState] = useState<CallState>('initiating');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Setup call ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const setupCall = async () => {
      try {
        // Video calls must keep the screen awake — the user holds the phone away
        // from their ear and isn't touching it, so the OS would otherwise dim and
        // lock the display mid-call (audio calls are fine asleep). Set this before
        // acquiring media so the screen stays on through the whole connect flow.
        if (callType === 'video') {
          callAudioService.setKeepScreenOn(true);
        }

        // Get local media
        const stream = await webrtcService.getLocalStream(callType);
        setLocalStream(stream);

        // Create peer connection
        await webrtcService.createPeerConnection(sessionId, iceServers);

        // NOTE: the initiator does NOT create the offer here. Doing so while
        // the callee is still ringing means the callee has no peer connection
        // yet and the offer is dropped (deadlock). The offer is created when
        // `call_accepted` arrives — see WebRTCService.call_accepted listener.

        setCallState('ringing');
      } catch (err) {
        console.error('[useWebRTC] Setup error:', err);
        // Permission denial is the common, user-actionable failure — surface it
        // explicitly instead of silently ending the call. getLocalStream throws
        // `Permission denied: <perm>`; getUserMedia rejects with a name/message
        // mentioning permission/NotAllowed on both platforms.
        const msg = err instanceof Error ? err.message : String(err);
        const isPermission =
          /permission|notallowed|denied/i.test(msg);
        if (isPermission) {
          Alert.alert(
            'Cần quyền truy cập',
            callType === 'video'
              ? 'Hãy cấp quyền micro và camera để thực hiện cuộc gọi video.'
              : 'Hãy cấp quyền micro để thực hiện cuộc gọi.',
          );
        }
        // End the session on the server too so the peer isn't left ringing.
        webrtcService.endCall(sessionId);
        setCallState('ended');
      }
    };

    setupCall();

    return () => {
      // Release the screen-on lock taken for video calls. Safe (no-op) for audio.
      if (callType === 'video') {
        callAudioService.setKeepScreenOn(false);
      }
      webrtcService.cleanup();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionId, callType, isInitiator, iceServers]);

  // ─── WebRTC event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const handleRemoteStream = (stream: unknown) => {
      setRemoteStream(stream as MediaStream);
      setCallState('active');
      // Start duration timer
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    };

    const handleCallAccepted = () => {
      // Caller-side: callee picked up. Media is not flowing yet (offer/answer
      // + ICE still in progress), so move to 'connecting'. 'active' is set when
      // the remote stream actually arrives (handleRemoteStream).
      setCallState('connecting');
    };

    const handleCallEnded = () => {
      setCallState('ended');
      if (timerRef.current) clearInterval(timerRef.current);
      onCallEnded?.();
    };

    const handleCallDeclined = () => {
      webrtcService.cleanup();
      setCallState('ended');
      if (timerRef.current) clearInterval(timerRef.current);
      onCallEnded?.();
    };

    const handlePeerDisconnected = () => {
      webrtcService.cleanup();
      setCallState('ended');
      if (timerRef.current) clearInterval(timerRef.current);
      onCallEnded?.();
    };

    // A Cancel while B is still ringing dismisses B, but the caller A also needs
    // to leave ringing. useWebRTC wasn't listening to call_cancelled, so A
    // stayed in ringing/idle with ringback already stopped but UI not dismissed.
    const handleCallCancelled = () => {
      webrtcService.cleanup();
      setCallState('ended');
      if (timerRef.current) clearInterval(timerRef.current);
      onCallEnded?.();
    };

    // Caller is on CallScreen ringing; callee never answered and the server
    // 30s timeout fired (`call_missed` → initiator). Without this listener the
    // caller's screen stays stuck on "Ringing..." forever. `call_timeout` is
    // the callee-side twin (handled on IncomingCallScreen before accept, but
    // listened here too for safety on the accepting device).
    const handleMissedOrTimeout = () => {
      setCallState('ended');
      if (timerRef.current) clearInterval(timerRef.current);
      onCallEnded?.();
    };

    // ICE gave up after max restarts, or the peer reported `call_failed`.
    // Surface 'failed' so the "Close and Redial" affordance actually renders
    // (previously nothing in the hook ever set this state).
    const handleCallFailed = () => {
      setCallState('failed');
      if (timerRef.current) clearInterval(timerRef.current);
    };

    webrtcService.on('remote_stream', handleRemoteStream);
    webrtcService.on('call_accepted', handleCallAccepted);
    webrtcService.on('call_ended', handleCallEnded);
    webrtcService.on('call_declined', handleCallDeclined);
    webrtcService.on('call_cancelled', handleCallCancelled);
    webrtcService.on('peer_disconnected', handlePeerDisconnected);
    webrtcService.on('call_missed', handleMissedOrTimeout);
    webrtcService.on('call_timeout', handleMissedOrTimeout);
    webrtcService.on('call_failed', handleCallFailed);

    return () => {
      webrtcService.off('remote_stream', handleRemoteStream);
      webrtcService.off('call_accepted', handleCallAccepted);
      webrtcService.off('call_ended', handleCallEnded);
      webrtcService.off('call_declined', handleCallDeclined);
      webrtcService.off('call_cancelled', handleCallCancelled);
      webrtcService.off('peer_disconnected', handlePeerDisconnected);
      webrtcService.off('call_missed', handleMissedOrTimeout);
      webrtcService.off('call_timeout', handleMissedOrTimeout);
      webrtcService.off('call_failed', handleCallFailed);
    };
  }, [onCallEnded]);

  // ─── Actions ────────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const muted = webrtcService.toggleMute();
    setIsMuted(muted);
  }, []);

  const toggleCamera = useCallback(() => {
    const off = webrtcService.toggleCamera();
    setIsCameraOff(off);
  }, []);

  const endCall = useCallback(() => {
    webrtcService.endCall(sessionId);
    setCallState('ended');
    if (timerRef.current) clearInterval(timerRef.current);
    onCallEnded?.();
  }, [sessionId, onCallEnded]);

  const cancelCall = useCallback(() => {
    webrtcService.cancelCall(sessionId);
    setCallState('ended');
    if (timerRef.current) clearInterval(timerRef.current);
    onCallEnded?.();
  }, [sessionId, onCallEnded]);

  const switchCamera = useCallback(() => {
    webrtcService.switchCamera();
  }, []);

  const formatDuration = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, []);

  return {
    callState,
    isMuted,
    isCameraOff,
    localStream,
    remoteStream,
    callDuration,
    formattedDuration: formatDuration(callDuration),
    toggleMute,
    toggleCamera,
    endCall,
    cancelCall,
    switchCamera,
  };
}
