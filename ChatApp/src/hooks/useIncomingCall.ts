import { useEffect, useCallback, useRef } from 'react';
import { webrtcService } from '../services/webrtc/WebRTCService';
import { navigationRef } from '../navigation/RootNavigator';
import { getAccessTokenInMemory } from '../services/api/apiService';

interface IncomingCallData {
  sessionId: string;
  fromUserId: string;
  fromUser?: { userId: string; displayName: string; avatar?: string };
  callType: 'audio' | 'video';
  conversationId: string;
  iceServers?: { urls: string; username?: string; credential?: string }[];
}

export function useIncomingCall() {
  const connectedRef = useRef(false);

  // Connect webrtc socket when authenticated
  useEffect(() => {
    const token = getAccessTokenInMemory();
    if (token && !connectedRef.current) {
      webrtcService.connect(token);
      connectedRef.current = true;
    }

    return () => {
      // Don't disconnect on unmount — keep listening
    };
  }, []);

  // Navigate to the full-screen IncomingCallModal. The modal itself owns
  // accept/decline UI and ringtone — no decisions made here.
  const handleIncomingCall = useCallback((data: unknown) => {
    const call = data as IncomingCallData;
    if (!navigationRef.isReady()) return;

    (navigationRef.navigate as (...args: unknown[]) => void)(
      'IncomingCallModal',
      {
        sessionId: call.sessionId,
        callType: call.callType,
        remoteUser: {
          id: call.fromUser?.userId ?? call.fromUserId,
          displayName: call.fromUser?.displayName ?? 'Unknown',
          avatar: call.fromUser?.avatar,
        },
        iceServers: call.iceServers,
      },
    );
  }, []);

  useEffect(() => {
    webrtcService.on('incoming_call', handleIncomingCall);

    return () => {
      webrtcService.off('incoming_call', handleIncomingCall);
    };
  }, [handleIncomingCall]);
}
