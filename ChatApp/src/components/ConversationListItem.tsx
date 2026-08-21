import React, { useCallback, useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Conversation } from '../types';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from './UserAvatar';
import { KoolaText, KoolaIconButton, koolaRadii, useTheme } from '../ui';
import type { SemanticTokens } from '../ui/tokens/semantic';
import { formatShortTimestamp } from '../utils/formatViTimestamp';
import { webrtcService } from '../services/webrtc/WebRTCService';
import type { RootStackParamList } from '../navigation/types';

interface Props {
  conversation: Conversation;
  onPress: (conversation: Conversation) => void;
}

export function resolveConversationHeader(
  conversation: Conversation,
  currentUserId: string | undefined,
): { displayName: string; avatar: string | undefined; isOnline: boolean } {
  if (conversation.type === 'group') {
    return {
      displayName: conversation.name || 'Nhóm',
      avatar: conversation.avatar || undefined,
      isOnline: false,
    };
  }
  const otherMember = (conversation.members || []).find((m) => {
    if (!m || !m.userId) return false;
    const memberId =
      typeof m.userId === 'object' ? (m.userId as any)._id : m.userId;
    return memberId !== currentUserId;
  });
  if (!otherMember) {
    return { displayName: 'Người dùng', avatar: undefined, isOnline: false };
  }
  if (typeof otherMember.userId === 'object') {
    const u = otherMember.userId as any;
    return {
      displayName: u.displayName || 'Người dùng',
      avatar: u.avatar || undefined,
      isOnline: Boolean(u.isOnline),
    };
  }
  return {
    displayName: otherMember.user?.displayName || 'Người dùng',
    avatar: otherMember.user?.avatar || undefined,
    isOnline: Boolean(otherMember.user?.isOnline),
  };
}

function resolveOtherUserId(
  conversation: Conversation,
  currentUserId: string | undefined,
): string | null {
  if (conversation.type === 'group') return null;
  const other = (conversation.members || []).find((m: any) => {
    if (!m || m.userId == null) return false;
    const rawId = m.userId;
    const id =
      rawId !== null && typeof rawId === 'object'
        ? (rawId as any)?._id
        : rawId;
    if (id == null) return false;
    return String(id) !== String(currentUserId ?? '');
  });
  if (!other) return null;
  const raw = (other as any).userId;
  if (raw != null && typeof raw === 'object' && '_id' in raw)
    return String((raw as any)._id);
  if (typeof raw === 'string') return raw;
  return null;
}

// ─── Message-type icon for preview line ──────────────────────────────────────
function getPreviewIcon(preview: string): string | null {
  const lower = preview.toLowerCase();
  if (lower.includes('[hình ảnh]') || lower.includes('[ảnh]') || lower.endsWith('.jpg') || lower.endsWith('.png')) return 'image';
  if (lower.includes('[video]') || lower.endsWith('.mp4')) return 'videocam';
  if (lower.includes('[tệp]') || lower.includes('[file]')) return 'attach-file';
  if (lower.includes('[tin nhắn thoại]') || lower.includes('[voice]')) return 'mic';
  return null;
}

const ConversationListItem: React.FC<Props> = ({ conversation, onPress }) => {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { displayName, avatar, isOnline } = resolveConversationHeader(
    conversation,
    user?._id,
  );
  const lastMessagePreview =
    conversation.lastMessagePreview || 'Chưa có tin nhắn';
  const timestamp = conversation.lastMessageAt
    ? formatShortTimestamp(new Date(conversation.lastMessageAt))
    : '';
  const unreadCount = conversation.unreadCount || 0;
  const previewIcon = getPreviewIcon(lastMessagePreview);
  const [isPressed, setIsPressed] = React.useState(false);

  // The parent passes ONE stable handler for every row (no per-item closure),
  // so this callback's identity only changes when the row's conversation
  // reference changes — which, combined with the parent's row-reference cache,
  // keeps React.memo effective for unchanged rows.
  const handlePress = useCallback(() => {
    onPress(conversation);
  }, [onPress, conversation]);

  const itemStyles = useMemo(() => makeItemStyles(tokens.semantic), [tokens.semantic]);

  const showQuickCall = conversation.type === 'direct' && !!resolveOtherUserId(conversation, user?._id);

  const handleQuickCall = useCallback(() => {
    const otherUserId = resolveOtherUserId(conversation, user?._id);
    if (!otherUserId) {
      Alert.alert('Lỗi', 'Không xác định được người nhận');
      return;
    }
    if (!webrtcService.isConnected()) {
      Alert.alert('Lỗi', 'Chưa kết nối, vui lòng thử lại.');
      return;
    }
    let settled = false;
    const cleanup = () => {
      webrtcService.off('call_initiated', onInitiated);
      webrtcService.off('call_busy', onBusy);
      webrtcService.off('call_missed', onMissed);
      webrtcService.off('error', onError);
      clearTimeout(timer);
    };
    const onInitiated = (data: unknown) => {
      if (settled) return;
      settled = true;
      const d = data as { sessionId?: string; iceServers?: { urls: string; username?: string; credential?: string }[] };
      cleanup();
      if (!d.sessionId) {
        Alert.alert('Lỗi', 'Không thể khởi tạo cuộc gọi');
        return;
      }
      const parent = (navigation as any).getParent?.();
      // Prefer RootStack navigation for CallModal
      const rootNav: NativeStackNavigationProp<RootStackParamList> =
        parent ?? navigation as unknown as NativeStackNavigationProp<RootStackParamList>;
      // Resolve remote user display for CallModal
      const header = resolveConversationHeader(conversation, user?._id);
      rootNav.navigate('CallModal', {
        sessionId: d.sessionId,
        callType: 'audio',
        isInitiator: true,
        iceServers: d.iceServers,
        remoteUser: { id: otherUserId, displayName: header.displayName, avatar: header.avatar },
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
      Alert.alert('Không trả lời', 'Người dùng hiện không trực tuyến.');
    };
    const onError = (data: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      const msg = (data as { message?: string })?.message || 'Cuộc gọi thất bại';
      Alert.alert('Lỗi', msg);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      Alert.alert('Hết thời gian', 'Máy chủ không phản hồi.');
    }, 15000);

    webrtcService.on('call_initiated', onInitiated);
    webrtcService.on('call_busy', onBusy);
    webrtcService.on('call_missed', onMissed);
    webrtcService.on('error', onError);

    webrtcService.initiateCall(otherUserId, conversation._id, 'audio');
  }, [conversation, user?._id, navigation]);

  return (
    <View style={[itemStyles.container, isPressed && itemStyles.pressed]}>
      <Pressable
        style={itemStyles.pressableContent}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
        android_ripple={{ color: tokens.semantic.surface.level0 }}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Trò chuyện với ${displayName}`}>
        <UserAvatar
          displayName={displayName}
          avatar={avatar}
          size={48}
          showOnline={isOnline}
        />

        <View style={itemStyles.content}>
          <View style={itemStyles.topRow}>
            <KoolaText
              variant="label"
              weight={unreadCount > 0 ? '800' : '700'}
              numberOfLines={1}
              style={itemStyles.name}>
              {displayName}
            </KoolaText>
            <KoolaText variant="caption" tone="faint" numberOfLines={1} style={itemStyles.timestamp}>
              {timestamp}
            </KoolaText>
          </View>
          <View style={itemStyles.bottomRow}>
            {previewIcon ? (
              <Icon name={previewIcon} size={14} color={tokens.semantic.text.muted} style={itemStyles.previewIcon} />
            ) : null}
            <KoolaText
              variant="caption"
              tone={unreadCount > 0 ? 'ink' : 'muted'}
              weight={unreadCount > 0 ? '600' : '400'}
              numberOfLines={1}
              style={itemStyles.preview}>
              {lastMessagePreview}
            </KoolaText>
            {unreadCount > 0 ? (
              <View style={itemStyles.badge}>
                <KoolaText
                  variant="caption"
                  weight="800"
                  style={itemStyles.badgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </KoolaText>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
      {showQuickCall ? (
        <KoolaIconButton
          icon="call"
          size={36}
          iconSize={18}
          tone="primary"
          variant="soft"
          onPress={handleQuickCall}
          accessibilityLabel="Gọi"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={itemStyles.quickCallBtn}
        />
      ) : null}
    </View>
  );
};

// ─── Token-aware styles ─────────────────────────────────────────────────────
function makeItemStyles(semantic: SemanticTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 72,
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: semantic.surface.level1,
    },
    pressableContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    pressed: {
      backgroundColor: semantic.surface.level0,
    },
    content: {
      flex: 1,
      marginLeft: 12,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    name: {
      flexShrink: 1,
      marginRight: 8,
    },
    timestamp: {
      fontSize: 11,
      flexShrink: 0,
    },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    previewIcon: {
      marginRight: 4,
      flexShrink: 0,
    },
    preview: {
      flex: 1,
      marginRight: 8,
    },
    badge: {
      backgroundColor: semantic.surface.level0,
      borderWidth: 1,
      borderColor: semantic.signal.unread,
      borderRadius: koolaRadii.pill,
      minWidth: 20,
      height: 20,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
      flexShrink: 0,
    },
    badgeText: {
      color: semantic.text.primary,
    },
    quickCallBtn: {
      marginLeft: 8,
    },
  });
}

export default React.memo(ConversationListItem);
