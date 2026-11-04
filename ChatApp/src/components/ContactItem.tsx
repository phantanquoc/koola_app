import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import UserAvatar from './UserAvatar';
import { KoolaText, koolaRadii, useTheme } from '../ui';
import type { SemanticTokens } from '../ui/tokens/semantic';
import type { UserSearchResult } from '../types';
import { makeChatRowCardStyle } from './chatRowCard';

interface Props {
  user: UserSearchResult;
  onPress: () => void;
}

const ContactItem: React.FC<Props> = ({ user, onPress }) => {
  const { tokens, resolvedScheme } = useTheme();
  const styles = useMemo(
    () => makeStyles(tokens.semantic, resolvedScheme),
    [tokens.semantic, resolvedScheme],
  );

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${user.displayName}, ${user.isOnline ? 'trực tuyến' : 'ngoại tuyến'}`}>
      <UserAvatar
        displayName={user.displayName}
        avatar={user.avatar}
        size={44}
        style={styles.avatar}
      />
      <View style={styles.info}>
        <KoolaText weight="600" numberOfLines={1}>{user.displayName}</KoolaText>
        <KoolaText tone="muted" variant="caption" numberOfLines={1} style={styles.email}>{user.email}</KoolaText>
      </View>
      <View style={[styles.statusDot, user.isOnline ? styles.online : styles.offline]} />
    </Pressable>
  );
};

const makeStyles = (semantic: SemanticTokens, scheme: 'light' | 'dark') =>
  StyleSheet.create({
    // Same detached-card recipe as ConversationListItem (`chatRowCard`): both
    // lists live inside Chat Home, so a shared elevation keeps them from
    // looking like two different apps when the user swipes between sub-tabs.
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 68,
      padding: 12,
      ...makeChatRowCardStyle(scheme),
    },
    pressed: {
      opacity: 0.7,
    },
    info: { flex: 1, minWidth: 0, flexShrink: 1, marginLeft: 12 },
    email: { marginTop: 2 },
    avatar: { flexShrink: 0 },
    statusDot: { width: 10, height: 10, borderRadius: koolaRadii.pill, marginLeft: 8, flexShrink: 0 },
    online: { backgroundColor: semantic.status.success },
    offline: { backgroundColor: semantic.border.subtle },
  });

export default ContactItem;
