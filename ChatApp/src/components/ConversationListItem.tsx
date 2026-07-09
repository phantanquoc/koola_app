import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import type { Conversation } from '../types';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from './UserAvatar';
import { KoolaText, koolaRadii } from '../ui';
import type { Palette } from '../ui/theme';

interface Props {
  conversation: Conversation;
  onPress: () => void;
  palette: Palette;
}

// Short Vietnamese timestamp: "5p" / "3g" / "5n" / "2tu" / "1th" / "1n2024"
function formatShortTimestamp(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'vừa xong';
  if (diffMin < 60) return `${diffMin}p`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}g`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}n`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return `${diffWeek}tu`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}th`;
  const diffYr = Math.floor(diffDay / 365);
  return `${diffYr}n`;
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

const ConversationListItem: React.FC<Props> = ({ conversation, onPress, palette }) => {
  const { user } = useAuth();
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

  const itemStyles = useMemo(() => makeItemStyles(palette), [palette]);

  return (
    <Pressable
      style={itemStyles.container}
      android_ripple={{ color: palette.canvas }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Trò chuyện với ${displayName}`}>
      <View style={itemStyles.avatarWrapper}>
        <UserAvatar displayName={displayName} avatar={avatar} size={48} />
        {isOnline ? <View style={itemStyles.onlineDot} /> : null}
      </View>

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
            <Icon name={previewIcon} size={14} color={palette.muted} style={itemStyles.previewIcon} />
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
              <KoolaText variant="caption" tone="surface" weight="800">
                {unreadCount > 99 ? '99+' : unreadCount}
              </KoolaText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

// ─── Palette-aware styles ────────────────────────────────────────────────────
function makeItemStyles(palette: Palette) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: palette.surface,
    },
    avatarWrapper: {
      position: 'relative',
    },
    content: {
      flex: 1,
      marginLeft: 12,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    name: {
      flex: 1,
    },
    timestamp: {
      fontSize: 11,
    },
    bottomRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 2,
      gap: 8,
    },
    previewIcon: {
      marginRight: 4,
    },
    preview: {
      flex: 1,
    },
    badge: {
      backgroundColor: palette.primary,
      borderRadius: koolaRadii.pill,
      minWidth: 20,
      height: 20,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
    },
    onlineDot: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: palette.success,
      borderWidth: 2,
      borderColor: palette.surface,
    },
  });
}

export default React.memo(ConversationListItem);
