import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import UserAvatar from './UserAvatar';
import { KoolaText, useTheme } from '../ui';
import type { SemanticTokens } from '../ui/tokens/semantic';
import type { UserSearchResult } from '../types';

interface Props {
  user: UserSearchResult;
  onPress: () => void;
}

const ContactItem: React.FC<Props> = ({ user, onPress }) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${user.displayName}, ${user.isOnline ? 'trực tuyến' : 'ngoại tuyến'}`}>
      <UserAvatar displayName={user.displayName} avatar={user.avatar} size={44} />
      <View style={styles.info}>
        <KoolaText weight="600" numberOfLines={1}>{user.displayName}</KoolaText>
        <KoolaText tone="muted" variant="caption" numberOfLines={1} style={styles.email}>{user.email}</KoolaText>
      </View>
      <View style={[styles.statusDot, user.isOnline ? styles.online : styles.offline]} />
    </Pressable>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: semantic.surface.level0,
    },
    pressed: {
      opacity: 0.7,
    },
    info: { flex: 1, marginLeft: 12 },
    email: { marginTop: 2 },
    statusDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 8 },
    online: { backgroundColor: semantic.status.success },
    offline: { backgroundColor: semantic.border.subtle },
  });

export default ContactItem;
