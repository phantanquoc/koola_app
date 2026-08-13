import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import type { Conversation } from '../types';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from './UserAvatar';
import { KoolaText, koolaRadii, useTheme } from '../ui';
import type { SemanticTokens } from '../ui/tokens/semantic';
import { formatShortTimestamp } from '../utils/formatViTimestamp';

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

  return (
    <Pressable
      style={[
        itemStyles.container,
        isPressed && itemStyles.pressed,
      ]}
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
  });
}

export default React.memo(ConversationListItem);
