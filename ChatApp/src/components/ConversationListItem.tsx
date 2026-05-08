import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import type { Conversation } from '../types';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from './UserAvatar';

interface Props {
  conversation: Conversation;
  onPress: () => void;
}

const ConversationListItem: React.FC<Props> = ({ conversation, onPress }) => {
  const { user } = useAuth();

  const getDisplayName = (): string => {
    if (conversation.type === 'group') {
      return conversation.name || 'Group';
    }
    const otherMember = conversation.members.find(
      (m) => m.userId !== user?._id,
    );
    return otherMember?.user?.displayName || 'Unknown User';
  };

  const getAvatar = (): string | undefined => {
    if (conversation.type === 'group') return conversation.avatar || undefined;
    const otherMember = conversation.members.find(
      (m) => m.userId !== user?._id,
    );
    return otherMember?.user?.avatar || undefined;
  };

  const displayName = getDisplayName();
  const avatar = getAvatar();
  const lastMessagePreview = conversation.lastMessagePreview || 'No messages yet';
  const timestamp = conversation.lastMessageAt
    ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })
    : '';
  const unreadCount = conversation.unreadCount || 0;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <UserAvatar displayName={displayName} avatar={avatar} size={48} />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
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
  container: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff' },
  content: { flex: 1, marginLeft: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', color: '#333', flex: 1, marginRight: 8 },
  timestamp: { fontSize: 12, color: '#999' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  preview: { fontSize: 14, color: '#666', flex: 1, marginRight: 8 },
  badge: {
    backgroundColor: '#2196F3', borderRadius: 10, minWidth: 20,
    height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
});

export default ConversationListItem;
