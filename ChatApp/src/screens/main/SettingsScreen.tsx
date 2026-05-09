import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PersonalTabStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { usersApi } from '../../services/api/apiService';
import UserAvatar from '../../components/UserAvatar';

const SettingsScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<PersonalTabStackParamList>>();
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user?.settings?.notificationsEnabled ?? true,
  );
  const [toggling, setToggling] = useState(false);

  const handleToggleNotifications = async (value: boolean) => {
    setToggling(true);
    setNotificationsEnabled(value);
    try {
      await usersApi.updateSettings({ notificationsEnabled: value });
    } catch {
      setNotificationsEnabled(!value); // Revert
      Alert.alert('Lỗi', 'Không thể cập nhật cài đặt thông báo');
    } finally {
      setToggling(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.profileSection} onPress={() => navigation.navigate('EditProfile')}>
        <UserAvatar displayName={user?.displayName || '?'} avatar={user?.avatar || undefined} size={80} />
        <Text style={styles.name}>{user?.displayName || 'Không rõ'}</Text>
        <Text style={styles.email}>{user?.email || ''}</Text>
        <Text style={styles.editHint}>Nhấn để chỉnh sửa hồ sơ</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <View style={styles.menuItemRow}>
          <Text style={styles.menuText}>Thông báo</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleToggleNotifications}
            disabled={toggling}
            trackColor={{ false: '#ddd', true: '#90CAF9' }}
            thumbColor={notificationsEnabled ? '#2196F3' : '#f4f3f4'}
          />
        </View>
        <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Quyền riêng tư', 'Dữ liệu của bạn được lưu trữ an toàn trên máy chủ.\n\nTin nhắn được mã hóa khi truyền qua TLS.\n\nMã hóa đầu cuối đang được phát triển.')}>
          <Text style={styles.menuText}>Quyền riêng tư</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Về Koola Chat', 'Phiên bản 1.0.0\n\nXây dựng bằng React Native + NestJS\n\n© 2026 Koola Chat')}>
          <Text style={styles.menuText}>Giới thiệu</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Đăng xuất</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  profileSection: { alignItems: 'center', paddingTop: (StatusBar.currentHeight || 0) + 16, paddingBottom: 32, backgroundColor: '#fff' },
  name: { fontSize: 20, fontWeight: '600', color: '#333', marginTop: 12 },
  email: { fontSize: 14, color: '#999', marginTop: 4 },
  editHint: { fontSize: 12, color: '#2196F3', marginTop: 4 },
  section: { marginTop: 16, backgroundColor: '#fff' },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  menuItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  menuText: { fontSize: 16, color: '#333' },
  menuArrow: { fontSize: 22, color: '#ccc' },
  logoutButton: {
    marginTop: 32, marginHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#ff4444', borderRadius: 8, alignItems: 'center',
  },
  logoutText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default SettingsScreen;
