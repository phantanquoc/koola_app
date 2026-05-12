import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  senderName: string;
  text?: string;
  mediaType?: string;
  isRight: boolean;
  onPress: () => void;
}

/**
 * Task 4.6: Compact quote region rendered at the top of a reply message bubble.
 * Shows the original sender's display name and preview text or media-type label.
 * Tappable — invokes onPress to scroll to original.
 */
const QuoteBubble: React.FC<Props> = ({ senderName, text, mediaType, isRight, onPress }) => {
  const getPreviewText = (): string => {
    if (mediaType === 'image') return '📷 Hình ảnh';
    if (mediaType === 'video') return '🎬 Video';
    if (mediaType === 'file') return '📄 Tệp đính kèm';
    if (mediaType === 'voice') return '🎤 Tin nhắn thoại';
    return text || '';
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.container, isRight ? styles.containerRight : styles.containerLeft]}
      accessibilityRole="button"
      accessibilityLabel={`Tin nhắn gốc từ ${senderName}`}>
      <View style={[styles.accent, isRight ? styles.accentRight : styles.accentLeft]} />
      <View style={styles.content}>
        <Text style={[styles.senderName, isRight ? styles.senderNameRight : styles.senderNameLeft]} numberOfLines={1}>
          {senderName}
        </Text>
        <Text style={[styles.preview, isRight ? styles.previewRight : styles.previewLeft]} numberOfLines={2}>
          {getPreviewText()}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 6,
    marginBottom: 4,
    marginHorizontal: 2,
    overflow: 'hidden',
    maxWidth: 240,
  },
  containerRight: { backgroundColor: 'rgba(255,255,255,0.2)' },
  containerLeft: { backgroundColor: 'rgba(0,0,0,0.06)' },
  accent: { width: 3, minHeight: 32 },
  accentRight: { backgroundColor: 'rgba(255,255,255,0.7)' },
  accentLeft: { backgroundColor: '#2196F3' },
  content: { flex: 1, paddingHorizontal: 6, paddingVertical: 4 },
  senderName: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  senderNameRight: { color: 'rgba(255,255,255,0.9)' },
  senderNameLeft: { color: '#2196F3' },
  preview: { fontSize: 12 },
  previewRight: { color: 'rgba(255,255,255,0.8)' },
  previewLeft: { color: '#555' },
});

export default QuoteBubble;
