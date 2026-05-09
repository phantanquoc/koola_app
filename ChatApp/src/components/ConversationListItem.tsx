import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import type { Conversation } from '../types';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from './UserAvatar';

interface Props {
  conversation: Conversation;
  onPress: () => void;
}

/**
 * Resolve the header data (display name, avatar mediaKey/URL, online status)
 * for a conversation from the perspective of `currentUserId`.
 *
 * Exported so navigators can pre-pass this to ChatScreen and avoid the
 * placeholder→avatar flicker on open.
 */
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
    const memberId = typeof m.userId === 'object' ? (m.userId as any)._id : m.userId;
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
  const { displayName, avatar, isOnline } = resolveConversationHeader(conversation, user?._id);
  const lastMessagePreview = conversation.lastMessagePreview || 'Chưa có tin nhắn';
  const timestamp = conversation.lastMessageAt
    ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true, locale: vi })
    : '';
  const unreadCount = conversation.unreadCount || 0;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Trò chuyện với ${displayName}`}>
      <View style={styles.avatarWrapper}>
        <UserAvatar displayName={displayName} avatar={avatar} size={50} />
        {isOnline && <View style={styles.onlineDot} />}
      </View>

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.name, unreadCount > 0 && styles.nameUnread]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.timestamp}>{timestamp}</Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.preview} numberOfLines={1}>{lastMessagePreview}</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  avatarWrapper: {
    position: 'relative',
  },
  content: {
    flex: 1,
    marginLeft: 14,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
    marginRight: 10,
  },
  nameUnread: {
    fontWeight: '700',
    color: '#111827',
  },
  timestamp: {
    fontSize: 12,
    color: '#6B7280',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  preview: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
    marginRight: 10,
  },
  badge: {
    backgroundColor: '#1565C0',
    borderRadius: 11,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
});

export default ConversationListItem;
