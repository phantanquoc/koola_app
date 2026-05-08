import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import type { MessageSearchItem } from '../../types';

interface Props {
  item: MessageSearchItem;
  onPress: () => void;
}

const CONTENT_MAX_CHARS = 80;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

function formatRelativeTime(isoDate: string): string {
  try {
    return formatDistanceToNow(new Date(isoDate), { addSuffix: true, locale: vi });
  } catch {
    return '';
  }
}

const MessageResultItem: React.FC<Props> = ({ item, onPress }) => {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Xem tin nhắn của ${item.senderDisplayName}`}>
      <View style={styles.row}>
        <Text style={styles.sender} numberOfLines={1}>
          {item.senderDisplayName}
        </Text>
        <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
      </View>
      <Text style={styles.content} numberOfLines={2}>
        {truncate(item.content, CONTENT_MAX_CHARS)}
      </Text>
      <Text style={styles.conversationName} numberOfLines={1}>
        {item.conversationName}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  sender: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
    color: '#9CA3AF',
    flexShrink: 0,
  },
  content: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  conversationName: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 3,
  },
});

export default MessageResultItem;
