import React, { useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { KoolaText, useTheme } from '../../../ui';
import type { SemanticTokens } from '../../../ui/tokens/semantic';

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
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  const getPreviewText = (): string => {
    if (mediaType === 'image') return '📷 Hình ảnh';
    if (mediaType === 'video') return '🎬 Video';
    if (mediaType === 'file') return '📄 Tệp đính kèm';
    if (mediaType === 'voice') return '🎤 Tin nhắn thoại';
    return text || '';
  };

  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, isRight ? styles.containerRight : styles.containerLeft]}
      accessibilityRole="button"
      accessibilityLabel={`Tin nhắn gốc từ ${senderName}`}>
      <View style={[styles.accent, isRight ? styles.accentRight : styles.accentLeft]} />
      <View style={styles.content}>
        <KoolaText
          weight="700"
          variant="caption"
          numberOfLines={1}
          style={isRight ? styles.senderNameRight : styles.senderNameLeft}>
          {senderName}
        </KoolaText>
        <KoolaText
          variant="caption"
          numberOfLines={2}
          style={isRight ? styles.previewRight : styles.previewLeft}>
          {getPreviewText()}
        </KoolaText>
      </View>
    </Pressable>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      borderRadius: 6,
      marginBottom: 4,
      marginHorizontal: 2,
      overflow: 'hidden',
      maxWidth: 240,
    },
    containerRight: { backgroundColor: 'rgba(255,255,255,0.2)' },
    containerLeft: { backgroundColor: semantic.surface.level1 },
    accent: { width: 3, minHeight: 32 },
    accentRight: { backgroundColor: 'rgba(255,255,255,0.7)' },
    accentLeft: { backgroundColor: semantic.action.primary },
    content: { flex: 1, paddingHorizontal: 6, paddingVertical: 4 },
    senderNameRight: { color: 'rgba(255,255,255,0.9)' },
    senderNameLeft: { color: semantic.action.primary },
    previewRight: { color: 'rgba(255,255,255,0.8)' },
    previewLeft: { color: semantic.text.muted },
  });

export default QuoteBubble;
