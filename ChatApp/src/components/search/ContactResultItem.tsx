import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import UserAvatar from '../UserAvatar';
import { KoolaText, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import type { UserSearchResult } from '../../types';

interface Props {
  contact: UserSearchResult;
  onPress: () => void;
}

const ContactResultItem: React.FC<Props> = ({ contact, onPress }) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Xem hồ sơ ${contact.displayName}`}>
      <UserAvatar displayName={contact.displayName} avatar={contact.avatar} size={44} />
      <View style={styles.info}>
        <KoolaText weight="600" numberOfLines={1}>
          {contact.displayName}
        </KoolaText>
        <KoolaText tone="muted" variant="caption" numberOfLines={1} style={styles.phone}>
          {contact.phone}
        </KoolaText>
      </View>
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
    phone: {
      marginTop: 2,
    },
  });

export default ContactResultItem;
