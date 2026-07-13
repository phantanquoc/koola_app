import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { KoolaText, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import type { MessageSearchItem } from '../../types';

interface Props {
  item: MessageSearchItem;
  onPress: () => void;
}

const CONTENT_MAX_CHARS = 80;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

function formatRelativeTime(isoDate: string): string {
  try {
    return formatDistanceToNow(new Date(isoDate), { addSuffix: true, locale: vi });
  } catch {
    return '';
  }
}

const MessageResultItem: React.FC<Props> = ({ item, onPress }) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Xem tin nhắn của ${item.senderDisplayName}`}>
      <View style={styles.row}>
        <KoolaText weight="700" numberOfLines={1} style={styles.sender}>
          {item.senderDisplayName}
        </KoolaText>
        <KoolaText variant="caption" tone="muted" style={styles.time}>{formatRelativeTime(item.createdAt)}</KoolaText>
      </View>
      <KoolaText numberOfLines={2} style={styles.content}>
        {truncate(item.content, CONTENT_MAX_CHARS)}
      </KoolaText>
      <KoolaText variant="caption" tone="muted" numberOfLines={1} style={styles.conversationName}>
        {item.conversationName}
      </KoolaText>
    </Pressable>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: semantic.surface.level0,
    },
    pressed: {
      opacity: 0.7,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 2,
    },
    sender: {
      flex: 1,
      marginRight: 8,
    },
    time: {
      flexShrink: 0,
    },
    content: {
      lineHeight: 20,
    },
    conversationName: {
      marginTop: 3,
    },
  });

export default MessageResultItem;
