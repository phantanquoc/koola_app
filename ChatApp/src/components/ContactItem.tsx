/**
 * ContactItem — tappable user row for contact search results.
 * Shows avatar, display name, and online status indicator.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { UserAvatar } from './UserAvatar';

export interface ContactItemProps {
  userId: string;
  displayName: string;
  email: string;
  avatar?: string;
  isOnline: boolean;
  onPress: (userId: string) => void;
  onLongPress?: (userId: string) => void;
}

export const ContactItem: React.FC<ContactItemProps> = ({
  userId,
  displayName,
  email,
  avatar,
  isOnline,
  onPress,
  onLongPress,
}) => {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(userId)}
      onLongPress={onLongPress ? () => onLongPress(userId) : undefined}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${isOnline ? 'online' : 'offline'}`}
    >
      <View style={styles.avatarWrapper}>
        <UserAvatar displayName={displayName} avatar={avatar} size={44} />
        <View
          style={[
            styles.onlineDot,
            { backgroundColor: isOnline ? 'rgb(76, 175, 80)' : 'rgb(189, 189, 189)' },
          ]}
        />
      </View>

      <View style={styles.info}>
        <Text style={styles.displayName} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.email} numberOfLines={1}>
          {email}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  displayName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  email: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
});
