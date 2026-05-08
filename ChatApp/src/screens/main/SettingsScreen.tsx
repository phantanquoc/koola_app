import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../../components/UserAvatar';

const SettingsScreen: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.profileSection}>
        <View style={styles.avatarWrapper}>
          <UserAvatar
            displayName={user?.displayName || ''}
            avatar={user?.avatar}
            size={80}
          />
        </View>
        <Text style={styles.name}>{user?.displayName || 'Unknown'}</Text>
        <Text style={styles.email}>{user?.email || ''}</Text>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>Notifications</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>Privacy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>About</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  profileSection: { alignItems: 'center', paddingVertical: 32, backgroundColor: '#fff' },
  avatarWrapper: { marginBottom: 12 },
  name: { fontSize: 20, fontWeight: '600', color: '#333' },
  email: { fontSize: 14, color: '#999', marginTop: 4 },
  section: { marginTop: 16, backgroundColor: '#fff' },
  menuItem: { paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  menuText: { fontSize: 16, color: '#333' },
  logoutButton: {
    marginTop: 32, marginHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#ff4444', borderRadius: 8, alignItems: 'center',
  },
  logoutText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default SettingsScreen;
