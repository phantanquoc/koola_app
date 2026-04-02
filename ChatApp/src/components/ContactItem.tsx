import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import UserAvatar from './UserAvatar';
import type { UserSearchResult } from '../types';

interface Props {
  user: UserSearchResult;
  onPress: () => void;
}

const ContactItem: React.FC<Props> = ({ user, onPress }) => {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <UserAvatar displayName={user.displayName} avatar={user.avatar} size={44} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{user.displayName}</Text>
        <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
      </View>
      <View style={[styles.statusDot, user.isOnline ? styles.online : styles.offline]} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff',
  },
  info: { flex: 1, marginLeft: 12 },
  name: { fontSize: 16, fontWeight: '600', color: '#333' },
  email: { fontSize: 13, color: '#999', marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 8 },
  online: { backgroundColor: '#4CAF50' },
  offline: { backgroundColor: '#ccc' },
});

export default ContactItem;
