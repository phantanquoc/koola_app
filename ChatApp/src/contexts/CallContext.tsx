/**
 * CallContext — global call state manager.
 * Listens for incoming calls, manages WebRTC lifecycle, provides call controls.
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { MediaStream } from 'react-native-webrtc';
import { webrtcService, CallState, IceServer } from '../services/webrtc/WebRTCService';
import { conversationsApi } from '../services/api/apiService';
import { useAuth } from './AuthContext';
import { navigationRef } from '../navigation/RootNavigator';

interface IncomingCall {
  sessionId: string;
  fromUserId: string;
  fromUser: { _id: string; displayName: string; avatar?: string };
  callType: 'audio' | 'video';
  conversationId: string;
  iceServers: IceServer[];
}

interface CallContextType {
  callState: CallState;
  currentSessionId: string | null;
  callType: 'audio' | 'video' | null;
  isInitiator: boolean;
  incomingCall: IncomingCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  callDuration: number;
  initiateCall: (targetUserId: string, conversationId: string, callType: 'audio' | 'video') => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  declineIncomingCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [callState, setCallState] = useState<CallState>('idle');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [isInitiator, setIsInitiator] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const iceServersRef = useRef<IceServer[]>([]);

  // ── Connect/disconnect WebRTC socket with auth ───────────────────────────────

  useEffect(() => {
    if (isAuthenticated) {
      webrtcService.connect();
    } else {
      webrtcService.disconnect();
    }
    return () => {
      webrtcService.disconnect();
    };
  }, [isAuthenticated]);

  // ── Request media permissions (Android) ──────────────────────────────────────

  const requestPermissions = useCallback(async (type: 'audio' | 'video') => {
    if (Platform.OS !== 'android') return true;
    const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (type === 'video') {
      perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    }
    const results = await PermissionsAndroid.requestMultiple(perms);
    return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
  }, []);

  // ── Start call duration timer ────────────────────────────────────────────────

  const startDurationTimer = useCallback(() => {
    setCallDuration(0);
    durationInterval.current = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
  }, []);

  // ── Navigate to call screen ──────────────────────────────────────────────────

  const navigateToCall = useCallback(
    (sessionId: string, type: 'audio' | 'video', initiator: boolean) => {
      if (!navigationRef.isReady()) return;
      (navigationRef as any).navigate('CallModal', {
        screen: 'Call',
        params: { sessionId, callType: type, isInitiator: initiator },
      });
    },
    [],
  );

  // ── Setup peer connection + signaling listeners ──────────────────────────────

  const setupPeerConnection = useCallback(
    async (sessionId: string, type: 'audio' | 'video') => {
      const stream = await webrtcService.getLocalStream(type);
      setLocalStream(stream);

      await webrtcService.createPeerConnection(
        iceServersRef.current,
        sessionId,
        (remote) => setRemoteStream(remote),
      );
    },
    [],
  );

  // ── Initiate call (caller) ───────────────────────────────────────────────────

  const initiateCall = useCallback(
    async (targetUserId: string, conversationId: string, type: 'audio' | 'video') => {
      const granted = await requestPermissions(type);
      if (!granted) {
        Alert.alert('Permission Required', 'Microphone and camera permissions are needed for calls.');
        return;
      }

      // Resolve target user if not provided (direct chat from ChatScreen)
      let resolvedTarget = targetUserId;
      if (!resolvedTarget && conversationId) {
        try {
          const res = await conversationsApi.get(conversationId);
          const conv = res.data;
          const otherMember = conv.members?.find(
            (m: any) => (m.userId ?? m._id ?? m) !== user?._id,
          );
          resolvedTarget = otherMember?.userId ?? otherMember?._id ?? otherMember;
        } catch {
          Alert.alert('Error', 'Could not start call.');
          return;
        }
      }

      if (!resolvedTarget) {
        Alert.alert('Error', 'Could not determine call target.');
        return;
      }

      setCallState('initiating');
      setCallType(type);
      setIsInitiator(true);

      webrtcService.initiateCall(resolvedTarget, conversationId, type);
    },
    [requestPermissions, user],
  );

  // ── Accept incoming call ─────────────────────────────────────────────────────

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCall) return;

    const granted = await requestPermissions(incomingCall.callType);
    if (!granted) {
      Alert.alert('Permission Required', 'Microphone and camera permissions are needed for calls.');
      webrtcService.declineCall(incomingCall.sessionId);
      resetCallState();
      return;
    }

    setCallState('connecting');
    iceServersRef.current = incomingCall.iceServers;

    await setupPeerConnection(incomingCall.sessionId, incomingCall.callType);
    webrtcService.acceptCall(incomingCall.sessionId);

    setCurrentSessionId(incomingCall.sessionId);
    setCallType(incomingCall.callType);
    setIsInitiator(false);
    setIncomingCall(null);

    navigateToCall(incomingCall.sessionId, incomingCall.callType, false);
  }, [incomingCall, requestPermissions, setupPeerConnection, navigateToCall]);

  // ── Decline incoming call ────────────────────────────────────────────────────

  const declineIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    webrtcService.declineCall(incomingCall.sessionId);
    setIncomingCall(null);
  }, [incomingCall]);

  // ── End call ─────────────────────────────────────────────────────────────────

  const resetCallState = useCallback(() => {
    webrtcService.cleanup();
    stopDurationTimer();
    setCallState('idle');
    setCurrentSessionId(null);
    setCallType(null);
    setIsInitiator(false);
    setIncomingCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsCameraOff(false);
    setCallDuration(0);
    iceServersRef.current = [];
  }, [stopDurationTimer]);

  const endCall = useCallback(() => {
    if (currentSessionId) {
      webrtcService.endCall(currentSessionId);
    }
    resetCallState();
  }, [currentSessionId, resetCallState]);

  // ── Toggle controls ──────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const muted = webrtcService.toggleMute();
    setIsMuted(muted);
  }, []);

  const toggleCamera = useCallback(() => {
    const off = webrtcService.toggleCamera();
    setIsCameraOff(off);
  }, []);

  // ── Socket event listeners ───────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated) return;

    // Caller receives: session created, iceServers
    const onCallInitiated = async (data: {
      sessionId: string;
      iceServers: IceServer[];
      targetUserId: string;
      callType: 'audio' | 'video';
    }) => {
      setCurrentSessionId(data.sessionId);
      setCallState('ringing');
      iceServersRef.current = data.iceServers;
      navigateToCall(data.sessionId, data.callType, true);
    };

    // Callee receives: incoming call
    const onIncomingCall = (data: IncomingCall) => {
      if (callState !== 'idle') {
        // Already in a call — auto-decline
        webrtcService.declineCall(data.sessionId);
        return;
      }
      setIncomingCall(data);
    };

    // Caller receives: callee accepted
    const onCallAccepted = async (data: { sessionId: string }) => {
      setCallState('connecting');
      await setupPeerConnection(data.sessionId, callType!);
      // Caller creates and sends offer
      await webrtcService.createOffer(data.sessionId);
    };

    // Caller receives: callee declined
    const onCallDeclined = (data: { sessionId: string; reason?: string }) => {
      Alert.alert('Call Declined', data.reason || 'The user declined your call.');
      resetCallState();
    };

    // Caller receives: callee didn't answer in time
    const onCallMissed = (data: { sessionId: string; reason?: string }) => {
      Alert.alert('No Answer', data.reason || 'The call was not answered.');
      resetCallState();
    };

    // Both receive: call ended by other party
    const onCallEnded = (_data: { sessionId: string }) => {
      resetCallState();
    };

    // Callee receives: SDP offer from caller
    const onCallOffer = async (data: { sessionId: string; fromUserId: string; sdp: any }) => {
      await webrtcService.handleRemoteOffer(data.sdp, data.sessionId);
      setCallState('active');
      startDurationTimer();
    };

    // Caller receives: SDP answer from callee
    const onCallAnswer = async (data: { sessionId: string; fromUserId: string; sdp: any }) => {
      await webrtcService.handleRemoteAnswer(data.sdp);
      setCallState('active');
      startDurationTimer();
    };

    // Both receive: ICE candidate from remote
    const onIceCandidate = async (data: { sessionId: string; fromUserId: string; candidate: any }) => {
      await webrtcService.handleRemoteIceCandidate(data.candidate);
    };

    webrtcService.on('call_initiated', onCallInitiated);
    webrtcService.on('incoming_call', onIncomingCall);
    webrtcService.on('call_accepted', onCallAccepted);
    webrtcService.on('call_declined', onCallDeclined);
    webrtcService.on('call_missed', onCallMissed);
    webrtcService.on('call_ended', onCallEnded);
    webrtcService.on('call_offer', onCallOffer);
    webrtcService.on('call_answer', onCallAnswer);
    webrtcService.on('call_ice_candidate', onIceCandidate);

    return () => {
      webrtcService.off('call_initiated', onCallInitiated);
      webrtcService.off('incoming_call', onIncomingCall);
      webrtcService.off('call_accepted', onCallAccepted);
      webrtcService.off('call_declined', onCallDeclined);
      webrtcService.off('call_missed', onCallMissed);
      webrtcService.off('call_ended', onCallEnded);
      webrtcService.off('call_offer', onCallOffer);
      webrtcService.off('call_answer', onCallAnswer);
      webrtcService.off('call_ice_candidate', onIceCandidate);
    };
  }, [
    isAuthenticated,
    callState,
    callType,
    navigateToCall,
    setupPeerConnection,
    resetCallState,
    startDurationTimer,
  ]);

  return (
    <CallContext.Provider
      value={{
        callState,
        currentSessionId,
        callType,
        isInitiator,
        incomingCall,
        localStream,
        remoteStream,
        isMuted,
        isCameraOff,
        callDuration,
        initiateCall,
        acceptIncomingCall,
        declineIncomingCall,
        endCall,
        toggleMute,
        toggleCamera,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
};
