import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import type { PersonalTabStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { usersApi } from '../../services/api/apiService';
import UserAvatar from '../../components/UserAvatar';
import {
  KoolaButton,
  KoolaDivider,
  KoolaSurface,
  KoolaText,
  koolaColors,
} from '../../ui';

const SettingsScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const tabBarInset = useTabBarBottomInset();
  const navigation =
    useNavigation<NativeStackNavigationProp<PersonalTabStackParamList>>();
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
      setNotificationsEnabled(!value);
      Alert.alert('Lỗi', 'Không thể cập nhật cài đặt thông báo');
    } finally {
      setToggling(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        { paddingBottom: tabBarInset },
      ]}
      showsVerticalScrollIndicator={false}>
      <Pressable
        style={styles.profileSection}
        onPress={() => navigation.navigate('EditProfile')}
        accessibilityRole="button">
        <UserAvatar
          displayName={user?.displayName || '?'}
          avatar={user?.avatar || undefined}
          size={84}
        />
        <KoolaText variant="heading" align="center" numberOfLines={2} style={styles.name}>
          {user?.displayName || 'Không rõ'}
        </KoolaText>
        <KoolaText tone="muted" align="center" numberOfLines={1}>
          {user?.email || ''}
        </KoolaText>
        <KoolaText variant="caption" tone="primary" weight="800" style={styles.editHint}>
          Nhấn để chỉnh sửa hồ sơ
        </KoolaText>
      </Pressable>

      <KoolaSurface variant="raised" style={styles.section}>
        <SettingsRow
          icon="account-circle"
          label="Danh sách tài khoản"
          onPress={() => navigation.navigate('AccountList')}
        />
        <KoolaDivider />
        <View style={styles.menuItemRow}>
          <View style={styles.menuLabelRow}>
            <MaterialIcons
              name="notifications-none"
              size={22}
              color={koolaColors.primary}
            />
            <KoolaText variant="label">Thông báo</KoolaText>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleToggleNotifications}
            disabled={toggling}
            trackColor={{ false: '#D0D5DD', true: '#93C5FD' }}
            thumbColor={notificationsEnabled ? koolaColors.primary : '#F2F4F7'}
          />
        </View>
        <KoolaDivider />
        <SettingsRow
          icon="lock-outline"
          label="Quyền riêng tư"
          onPress={() =>
            Alert.alert(
              'Quyền riêng tư',
              'Dữ liệu của bạn được lưu trữ an toàn trên máy chủ.\n\nTin nhắn được mã hóa khi truyền qua TLS.\n\nMã hóa đầu cuối đang được phát triển.',
            )
          }
        />
        <KoolaDivider />
        <SettingsRow
          icon="info-outline"
          label="Giới thiệu"
          onPress={() =>
            Alert.alert(
              'Về Koola Chat',
              'Phiên bản 1.0.0\n\nXây dựng bằng React Native + NestJS\n\n© 2026 Koola Chat',
            )
          }
        />
        <KoolaDivider />
        <SettingsRow
          icon="storage"
          label="Bộ nhớ đệm"
          onPress={() => navigation.navigate('StorageSettings')}
        />
      </KoolaSurface>

      <KoolaButton
        title="Đăng xuất"
        icon="logout"
        variant="danger"
        onPress={logout}
        style={styles.logoutButton}
      />
    </ScrollView>
  );
};

interface SettingsRowProps {
  icon: string;
  label: string;
  onPress: () => void;
}

const SettingsRow: React.FC<SettingsRowProps> = ({ icon, label, onPress }) => (
  <Pressable style={styles.menuItem} onPress={onPress} accessibilityRole="button">
    <View style={styles.menuLabelRow}>
      <MaterialIcons name={icon} size={22} color={koolaColors.primary} />
      <KoolaText variant="label">{label}</KoolaText>
    </View>
    <MaterialIcons name="chevron-right" size={22} color={koolaColors.faint} />
  </Pressable>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  profileSection: {
    alignItems: 'center',
    paddingTop: (StatusBar.currentHeight || 0) + 22,
    paddingBottom: 28,
  },
  name: {
    marginTop: 12,
  },
  editHint: {
    marginTop: 6,
  },
  section: {
    overflow: 'hidden',
  },
  menuItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  menuLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  logoutButton: {
    marginTop: 22,
  },
});

export default SettingsScreen;
