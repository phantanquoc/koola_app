import { useCallback } from 'react';
import { Alert } from 'react-native';
import type { MutableRefObject } from 'react';
import {
  useNavigation,
  type NavigationProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { conversationsApi } from '../../../services/api/apiService';
import { webrtcService } from '../../../services/webrtc/WebRTCService';
import type { Conversation } from '../../../types';
import type { RootStackParamList } from '../../../navigation/types';

type CallType = 'audio' | 'video';

interface UseCallInitiationArgs {
  conversationId: string;
  conversation: Conversation | null;
  currentUserId: string;
  setConversation: (conv: Conversation) => void;
  isFocusedRef: MutableRefObject<boolean>;
  isMountedRef: MutableRefObject<boolean>;
}

interface UseCallInitiationResult {
  handleStartCall: (callType: CallType) => Promise<void>;
}

const CALL_TIMEOUT_MS = 15000;

export function useCallInitiation({
  conversationId,
  conversation,
  currentUserId,
  setConversation,
  isFocusedRef,
  isMountedRef,
}: UseCallInitiationArgs): UseCallInitiationResult {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const handleStartCall = useCallback(
    async (callType: CallType) => {
      let conv = conversation;
      if (!conv) {
        try {
          const data = await conversationsApi.getDetails(conversationId);
          conv = (data.conversation || data) as Conversation;
          if (isFocusedRef.current && isMountedRef.current) {
            setConversation(conv);
          }
        } catch {
          Alert.alert('Lỗi', 'Không thể tải thông tin cuộc trò chuyện');
          return;
        }
      }

      if (conv.type === 'group') {
        Alert.alert('Thông báo', 'Gọi nhóm đang được phát triển');
        return;
      }

      const other = conv.members?.find((m: any) => {
        const id = typeof m.userId === 'object' ? m.userId._id : m.userId;
        return id !== currentUserId;
      });
      const otherUserId =
        other &&
        (typeof other.userId === 'object'
          ? (other.userId as any)._id
          : other.userId);
      if (!otherUserId) {
        Alert.alert('Lỗi', 'Không xác định được người nhận cuộc gọi');
        return;
      }

      const rootNav = (
        navigation as unknown as NativeStackNavigationProp<RootStackParamList>
      ).getParent();

      let settled = false;
      const cleanup = () => {
        webrtcService.off('call_initiated', onInitiated);
        webrtcService.off('call_missed', onMissed);
        webrtcService.off('call_busy', onBusy);
        webrtcService.off('error', onError);
        clearTimeout(timer);
      };
      const onInitiated = (data: unknown) => {
        if (settled) return;
        settled = true;
        const { sessionId, iceServers: servers } =
          (data as {
            sessionId?: string;
            iceServers?: {
              urls: string;
              username?: string;
              credential?: string;
            }[];
          }) || {};
        cleanup();
        if (!sessionId) {
          Alert.alert('Lỗi', 'Không thể khởi tạo cuộc gọi');
          return;
        }
        rootNav?.navigate('CallModal', {
          sessionId,
          callType,
          isInitiator: true,
          iceServers: servers,
        });
      };
      const onBusy = () => {
        if (settled) return;
        settled = true;
        cleanup();
        Alert.alert('Bận', 'Người dùng đang bận.');
      };
      const onMissed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        Alert.alert('Không thể gọi', 'Người dùng hiện không trực tuyến');
      };
      const onError = (data: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        const msg =
          (data as { message?: string })?.message || 'Cuộc gọi thất bại';
        Alert.alert('Lỗi', msg);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        Alert.alert(
          'Hết thời gian',
          'Máy chủ không phản hồi. Vui lòng thử lại.',
        );
      }, CALL_TIMEOUT_MS);

      webrtcService.on('call_initiated', onInitiated);
      webrtcService.on('call_busy', onBusy);
      webrtcService.on('call_missed', onMissed);
      webrtcService.on('error', onError);

      webrtcService.initiateCall(otherUserId, conversationId, callType);
    },
    [
      conversation,
      conversationId,
      currentUserId,
      navigation,
      setConversation,
      isFocusedRef,
      isMountedRef,
    ],
  );

  return { handleStartCall };
}
