import { useCallback, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { conversationsApi } from '../../../services/api/apiService';
import { useKoolaToast } from '../../../ui';

/**
 * Open the direct chat with a seller's business account (commerce-catalog
 * spec: "Chat with the seller uses the real business id").
 *
 * Sellers are real verified business users now, so the old 404 "Gian hàng mẫu
 * chưa có tài khoản thật" branch is gone (design D13); any failure shows one
 * generic retry toast. A ref guard drops double taps while a request runs.
 */
export function useSellerChat() {
  const navigation = useNavigation();
  // useKoolaToast() returns a new object each render; keep it out of deps.
  const toastRef = useRef(useKoolaToast());
  const [contactingSellerId, setContactingSellerId] = useState<string | null>(null);
  const busyRef = useRef(false);

  const openSellerChat = useCallback(
    async (sellerId: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setContactingSellerId(sellerId);
      try {
        const { conversation } = await conversationsApi.startDirectChat(sellerId);
        (navigation as unknown as { navigate: (a: string, b: unknown) => void }).navigate('ChatTab', {
          screen: 'Chat',
          params: { conversationId: conversation._id },
        });
      } catch {
        toastRef.current.show('Không thể bắt đầu trò chuyện. Bạn thử lại nhé.', 'warning');
      } finally {
        busyRef.current = false;
        setContactingSellerId(null);
      }
    },
    [navigation],
  );

  return { openSellerChat, contactingSellerId };
}

export default useSellerChat;
