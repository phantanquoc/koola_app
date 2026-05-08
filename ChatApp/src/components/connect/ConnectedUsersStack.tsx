import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import type { BusinessConnectedUser } from '../../types';

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
                <Text style={styles.initial}>
                  {user.displayName?.charAt(0)?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
          </View>
        );
      })}
      {remaining > 0 && (
        <Text style={styles.countText}>+{remaining}</Text>
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
    borderColor: '#FFFFFF',
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
    fontWeight: '700',
    color: '#FFFFFF',
  },
  countText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    marginLeft: 6,
  },
});

export default ConnectedUsersStack;
