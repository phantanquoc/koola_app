import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { PinnedMessage } from '../types';

interface Props {
  pinnedMessages: PinnedMessage[];
  messageContents: Record<string, string>;
  onPress: (messageId: string) => void;
  onClose: (messageId: string) => void;
  onShowList?: () => void;
}

const PinBanner: React.FC<Props> = ({ pinnedMessages, messageContents, onPress, onClose, onShowList }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset index when pinned messages change
  useEffect(() => {
    setCurrentIndex(0);
  }, [pinnedMessages.length]);

  if (!pinnedMessages || pinnedMessages.length === 0) return null;

  const sorted = [...pinnedMessages].sort(
    (a, b) => new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime(),
  );
  const current = sorted[currentIndex % sorted.length];
  const content = messageContents[current.messageId] || 'Tin nhắn được ghim';
  const truncated = content.length > 50 ? content.substring(0, 50) + '...' : content;

  const handleTap = () => {
    if (sorted.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % sorted.length);
    }
    onPress(current.messageId);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.tapArea}
        onPress={handleTap}
        activeOpacity={0.7}
      >
        <Text style={styles.icon}>📌</Text>
        <View style={styles.content}>
          <Text style={styles.text} numberOfLines={1}>{truncated}</Text>
          {sorted.length > 1 && (
            <Text style={styles.counter}>{(currentIndex % sorted.length) + 1}/{sorted.length}</Text>
          )}
        </View>
      </TouchableOpacity>
      {sorted.length > 1 && onShowList && (
        <TouchableOpacity
          onPress={onShowList}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.listBtn}
        >
          <MaterialIcons name="format-list-bulleted" size={18} color="#666" />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={() => onClose(current.messageId)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.closeBtn}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE082',
  },
  tapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: { fontSize: 16, marginRight: 8 },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  text: { fontSize: 14, color: '#333', flex: 1 },
  counter: { fontSize: 12, color: '#999', marginLeft: 8 },
  listBtn: { padding: 4, marginRight: 4 },
  closeBtn: { fontSize: 16, color: '#999', padding: 4 },
});

export default PinBanner;
