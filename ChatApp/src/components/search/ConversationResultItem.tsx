import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import UserAvatar from '../UserAvatar';
import { KoolaText, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import type { Conversation } from '../../types';

interface Props {
  conversation: Conversation;
  displayName: string;
  avatar?: string;
  onPress: () => void;
}

const ConversationResultItem: React.FC<Props> = ({
  conversation,
  displayName,
  avatar,
  onPress,
}) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Mở cuộc trò chuyện với ${displayName}`}>
      <UserAvatar displayName={displayName} avatar={avatar} size={44} />
      <View style={styles.info}>
        <KoolaText weight="600" numberOfLines={1}>
          {displayName}
        </KoolaText>
        {conversation.lastMessagePreview ? (
          <KoolaText tone="muted" variant="caption" numberOfLines={1} style={styles.preview}>
            {conversation.lastMessagePreview}
          </KoolaText>
        ) : null}
      </View>
      {conversation.type === 'group' ? (
        <View style={styles.tagContainer}>
          <KoolaText variant="caption" tone="muted">Nhóm</KoolaText>
        </View>
      ) : null}
    </Pressable>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: semantic.surface.level0,
    },
    pressed: {
      opacity: 0.7,
    },
    info: {
      flex: 1,
      marginLeft: 12,
    },
    preview: {
      marginTop: 2,
    },
    tagContainer: {
      backgroundColor: semantic.surface.level1,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      marginLeft: 8,
    },
  });

export default ConversationResultItem;
