import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import type { BusinessConnectedUser } from '../../types';
import { KoolaText, koolaColors } from '../../ui';

interface ConnectedUsersStackProps {
  users: BusinessConnectedUser[];
  totalCount: number;
}

const AVATAR_SIZE = 22;
const OVERLAP = -6;
const COLORS = ['#5C6BC0', '#26A69A', '#7E57C2', '#42A5F5', '#66BB6A'];

const ConnectedUsersStack: React.FC<ConnectedUsersStackProps> = ({
  users,
  totalCount,
}) => {
  if (totalCount === 0) return null;

  const displayUsers = users.slice(0, 3);
  const remaining = totalCount - displayUsers.length;

  return (
    <View style={styles.container}>
      {displayUsers.map((user, index) => {
        const bgColor = COLORS[index % COLORS.length];
        return (
          <View
            key={user._id}
            style={[
              styles.avatarWrapper,
              { marginLeft: index === 0 ? 0 : OVERLAP, zIndex: 10 - index },
            ]}>
            {user.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: bgColor }]}>
                <KoolaText variant="caption" weight="700" tone="surface" style={styles.initial}>
                  {user.displayName?.charAt(0)?.toUpperCase() || '?'}
                </KoolaText>
              </View>
            )}
          </View>
        );
      })}
      {remaining > 0 && (
        <KoolaText variant="caption" weight="600" tone="muted" style={styles.countText}>
          +{remaining}
        </KoolaText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    borderWidth: 1.5,
    borderColor: koolaColors.surface,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: {
    fontSize: 10,
  },
  countText: {
    marginLeft: 6,
  },
});

export default ConnectedUsersStack;
