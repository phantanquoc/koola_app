import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Conversation } from '../types';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from './UserAvatar';
import { KoolaText, koolaColors, koolaRadii } from '../ui';

interface Props {
  conversation: Conversation;
  onPress: () => void;
}

// Short Vietnamese timestamp: "5p" / "3g" / "5n" / "2tu" / "1th" / "1n2024"
function formatShortTimestamp(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
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

const ConversationListItem: React.FC<Props> = ({ conversation, onPress }) => {
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

  return (
    <Pressable
      style={styles.container}
      android_ripple={{ color: koolaColors.canvas }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Trò chuyện với ${displayName}`}>
      <View style={styles.avatarWrapper}>
        <UserAvatar displayName={displayName} avatar={avatar} size={44} />
        {isOnline ? <View style={styles.onlineDot} /> : null}
      </View>

      <View style={styles.content}>
        <View style={styles.topRow}>
          <KoolaText
            variant="label"
            weight={unreadCount > 0 ? '800' : '700'}
            numberOfLines={1}
            style={styles.name}>
            {displayName}
          </KoolaText>
          <KoolaText variant="caption" tone="faint" numberOfLines={1} style={styles.timestamp}>
            {timestamp}
          </KoolaText>
        </View>
        <View style={styles.bottomRow}>
          <KoolaText
            variant="caption"
            tone={unreadCount > 0 ? 'ink' : 'muted'}
            weight={unreadCount > 0 ? '600' : '400'}
            numberOfLines={1}
            style={styles.preview}>
            {lastMessagePreview}
          </KoolaText>
          {unreadCount > 0 ? (
            <View style={styles.badge}>
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

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: koolaColors.surface,
  },
  pressed: {
    backgroundColor: koolaColors.canvas,
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
  preview: {
    flex: 1,
  },
  badge: {
    backgroundColor: koolaColors.primary,
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
    backgroundColor: koolaColors.success,
    borderWidth: 2,
    borderColor: koolaColors.surface,
  },
});

export default ConversationListItem;
