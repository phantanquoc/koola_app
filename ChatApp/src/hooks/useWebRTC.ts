import { useState, useEffect, useCallback, useRef } from 'react';
import { webrtcService, CallState, IceServerConfig } from '../services/webrtc/webrtcService';
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
        // Get local media
        const stream = await webrtcService.getLocalStream(callType);
        setLocalStream(stream);

        // Create peer connection
        await webrtcService.createPeerConnection(sessionId, iceServers);

        // If initiator, create and send offer
        if (isInitiator) {
          await webrtcService.createAndSendOffer(sessionId);
        }

        setCallState('ringing');
      } catch (err) {
        console.error('[useWebRTC] Setup error:', err);
        setCallState('ended');
      }
    };

    setupCall();

    return () => {
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
      setCallState('active');
    };

    const handleCallEnded = () => {
      setCallState('ended');
      if (timerRef.current) clearInterval(timerRef.current);
      onCallEnded?.();
    };

    const handleCallDeclined = () => {
      setCallState('ended');
      onCallEnded?.();
    };

    const handlePeerDisconnected = () => {
      setCallState('ended');
      if (timerRef.current) clearInterval(timerRef.current);
      onCallEnded?.();
    };

    webrtcService.on('remote_stream', handleRemoteStream);
    webrtcService.on('call_accepted', handleCallAccepted);
    webrtcService.on('call_ended', handleCallEnded);
    webrtcService.on('call_declined', handleCallDeclined);
    webrtcService.on('peer_disconnected', handlePeerDisconnected);

    return () => {
      webrtcService.off('remote_stream', handleRemoteStream);
      webrtcService.off('call_accepted', handleCallAccepted);
      webrtcService.off('call_ended', handleCallEnded);
      webrtcService.off('call_declined', handleCallDeclined);
      webrtcService.off('peer_disconnected', handlePeerDisconnected);
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
  };
}
