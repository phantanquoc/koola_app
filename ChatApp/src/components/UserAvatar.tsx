/**
 * UserAvatar — circular avatar component.
 * Shows image if avatar URL provided, otherwise renders initials with deterministic background color.
 */
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

const PALETTE = [
  '#E57373', // red
  '#64B5F6', // blue
  '#81C784', // green
  '#FFD54F', // yellow
  '#FF8A65', // orange
  '#BA68C8', // purple
  '#4DB6AC', // teal
  '#F06292', // pink
];

export interface UserAvatarProps {
  displayName: string;
  avatar?: string;
  size?: number;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  displayName,
  avatar,
  size = 44,
}) => {
  const initials = displayName.trim()[0]?.toUpperCase() ?? '?';
  const backgroundColor = PALETTE[displayName.charCodeAt(0) % PALETTE.length];
  const fontSize = size * 0.4;

  if (avatar) {
    return (
      <Image
        source={{ uri: avatar }}
        style={[
          styles.image,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.initials,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
      ]}
    >
      <Text style={[styles.initialsText, { fontSize }]}>{initials}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#e0e0e0',
  },
  initials: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    color: '#fff',
    fontWeight: '600',
  },
});
