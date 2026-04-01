import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import type { Conversation } from '../types';

interface Props {
  conversation: Conversation;
  onPress: (conversation: Conversation) => void;
}

export const ConversationListItem: React.FC<Props> = ({ conversation, onPress }) => {
  const otherMembers = conversation.members.filter((m) => m._id !== 'system');
  const displayName = conversation.name
    ?? otherMembers.map((m) => m.displayName || m.email).join(', ')
    ?? 'Unknown';

  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const lastMessagePreview = getLastMessagePreview(conversation.lastMessage);
  const lastMessageTime = conversation.lastMessageAt
    ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: false })
    : '';

  const unread = conversation.unreadCount;
  const showBadge = unread > 0;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(conversation)}
      activeOpacity={0.6}>
      {/* Avatar */}
      {conversation.avatar ? (
        <Image source={{ uri: conversation.avatar }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          {lastMessageTime ? (
            <Text style={styles.time}>{lastMessageTime}</Text>
          ) : null}
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.preview} numberOfLines={1}>{lastMessagePreview}</Text>
          {showBadge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unread > 99 ? '99+' : unread}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
};

function getLastMessagePreview(msg?: Conversation['lastMessage']): string {
  if (!msg) return '';
  if (msg.type === 'image') return '📷 Photo';
  if (msg.type === 'file') return `📄 ${msg.content}`;
  if (msg.type === 'voice') return '🎤 Voice message';
  if (msg.type === 'system') return msg.content;
  return msg.content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e8e8e8',
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
  },
  content: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
    color: '#999',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  preview: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    marginRight: 8,
  },
  badge: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
