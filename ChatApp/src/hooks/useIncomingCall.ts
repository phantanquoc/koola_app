import { useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
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

  const handleIncomingCall = useCallback((data: unknown) => {
    const call = data as IncomingCallData;
    const callerName = call.fromUser?.displayName || 'Someone';
    const typeLabel = call.callType === 'video' ? 'Video' : 'Audio';

    Alert.alert(
      `Incoming ${typeLabel} Call`,
      `${callerName} is calling you`,
      [
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => {
            webrtcService.declineCall(call.sessionId);
          },
        },
        {
          text: 'Accept',
          onPress: () => {
            webrtcService.acceptCall(call.sessionId);
            if (navigationRef.isReady()) {
              (navigationRef.navigate as (...args: unknown[]) => void)(
                'CallModal',
                {
                  sessionId: call.sessionId,
                  callType: call.callType,
                  isInitiator: false,
                },
              );
            }
          },
        },
      ],
      { cancelable: false },
    );
  }, []);

  useEffect(() => {
    webrtcService.on('incoming_call', handleIncomingCall);

    return () => {
      webrtcService.off('incoming_call', handleIncomingCall);
    };
  }, [handleIncomingCall]);
}
