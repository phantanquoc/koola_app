import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

const AVATAR_COLORS = [
  '#F44336', '#E91E63', '#9C27B0', '#673AB7',
  '#3F51B5', '#2196F3', '#009688', '#FF9800',
];

interface Props {
  displayName: string;
  avatar?: string;
  size?: number;
}

const UserAvatar: React.FC<Props> = ({ displayName, avatar, size = 48 }) => {
  if (avatar) {
    return (
      <Image
        source={{ uri: avatar }}
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      />
    );
  }

  const initial = displayName?.[0]?.toUpperCase() || '?';
  const colorIndex = displayName ? displayName.charCodeAt(0) % AVATAR_COLORS.length : 0;
  const backgroundColor = AVATAR_COLORS[colorIndex];

  return (
    <View
      style={[
        styles.placeholder,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
      ]}>
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  avatar: { resizeMode: 'cover' },
  placeholder: { justifyContent: 'center', alignItems: 'center' },
  initial: { color: '#fff', fontWeight: 'bold' },
});

export default UserAvatar;
