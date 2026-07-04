import React, { useMemo, useState } from 'react';
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
  useTheme,
} from '../../ui';
import type { ThemeMode, Palette } from '../../ui/theme';

// ─── Theme Segmented Control ─────────────────────────────────────────────────

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Sáng' },
  { mode: 'dark', label: 'Tối' },
  { mode: 'system', label: 'Tự động' },
];

interface ThemeSegmentedControlProps {
  currentMode: ThemeMode;
  onSelect: (mode: ThemeMode) => void;
  palette: Palette;
}

const ThemeSegmentedControl: React.FC<ThemeSegmentedControlProps> = ({
  currentMode,
  onSelect,
  palette,
}) => {
  const segStyles = useMemo(() => makeSegStyles(palette), [palette]);
  return (
    <View style={segStyles.container} accessibilityRole="tablist">
      {THEME_OPTIONS.map(({ mode, label }) => {
        const isSelected = mode === currentMode;
        return (
          <Pressable
            key={mode}
            style={[segStyles.segment, isSelected && segStyles.segmentSelected]}
            onPress={() => onSelect(mode)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={label}>
            <KoolaText
              variant="caption"
              weight="700"
              tone={isSelected ? 'primary' : 'muted'}>
              {label}
            </KoolaText>
          </Pressable>
        );
      })}
    </View>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────

const SettingsScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const tabBarInset = useTabBarBottomInset();
  const navigation =
    useNavigation<NativeStackNavigationProp<PersonalTabStackParamList>>();
  const { palette, mode, setMode } = useTheme();
  const styles = useMemo(() => makeScreenStyles(palette), [palette]);
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

      {/* Theme mode selector */}
      <KoolaSurface variant="raised" style={styles.section}>
        <View style={styles.menuItemRow}>
          <View style={styles.menuLabelRow}>
            <MaterialIcons name="palette" size={22} color={palette.primary} />
            <KoolaText variant="label">Giao diện</KoolaText>
          </View>
        </View>
        <ThemeSegmentedControl
          currentMode={mode}
          onSelect={setMode}
          palette={palette}
        />
      </KoolaSurface>

      <KoolaSurface variant="raised" style={styles.section}>
        <SettingsRow icon="account-circle" label="Danh sách tài khoản" onPress={() => navigation.navigate('AccountList')} palette={palette} />
        <KoolaDivider />
        <View style={styles.menuItemRow}>
          <View style={styles.menuLabelRow}>
            <MaterialIcons name="notifications-none" size={22} color={palette.primary} />
            <KoolaText variant="label">Thông báo</KoolaText>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleToggleNotifications}
            disabled={toggling}
            trackColor={{ false: palette.line, true: palette.primarySoft }}
            thumbColor={notificationsEnabled ? palette.primary : palette.faint}
          />
        </View>
        <KoolaDivider />
        <SettingsRow icon="lock-outline" label="Quyền riêng tư" onPress={() => Alert.alert('Quyền riêng tư', 'Dữ liệu của bạn được lưu trữ an toàn trên máy chủ.\n\nTin nhắn được mã hóa khi truyền qua TLS.\n\nMã hóa đầu cuối đang được phát triển.')} palette={palette} />
        <KoolaDivider />
        <SettingsRow icon="info-outline" label="Giới thiệu" onPress={() => Alert.alert('Về Koola Chat', 'Phiên bản 1.0.0\n\nXây dựng bằng React Native + NestJS\n\n© 2026 Koola Chat')} palette={palette} />
        <KoolaDivider />
        <SettingsRow icon="storage" label="Bộ nhớ đệm" onPress={() => navigation.navigate('StorageSettings')} palette={palette} />
      </KoolaSurface>

      <KoolaButton
        title="Đăng xuất"
        icon="logout"
        variant="danger"
        onPress={logout}
        style={styles.logoutButton}
      />

      {/* __DEV__ only — Logo Lab playground for 3D variant experiments */}
      {__DEV__ && (
        <KoolaSurface variant="raised" style={styles.section}>
          <SettingsRow
            icon="science"
            label="[DEV] Logo Lab"
            onPress={() => (navigation as any).navigate('ChatTab', { screen: 'LogoLab' })}
            palette={palette}
          />
        </KoolaSurface>
      )}
    </ScrollView>
  );
};

// ─── SettingsRow helper ──────────────────────────────────────────────────────

interface SettingsRowProps {
  icon: string;
  label: string;
  onPress: () => void;
  palette: Palette;
}

const SettingsRow: React.FC<SettingsRowProps> = ({ icon, label, onPress, palette }) => (
  <Pressable style={settingsRowStyles.menuItem} onPress={onPress} accessibilityRole="button">
    <View style={settingsRowStyles.menuLabelRow}>
      <MaterialIcons name={icon} size={22} color={palette.primary} />
      <KoolaText variant="label">{label}</KoolaText>
    </View>
    <MaterialIcons name="chevron-right" size={22} color={palette.faint} />
  </Pressable>
);

const settingsRowStyles = StyleSheet.create({
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
});

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeScreenStyles = (p: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: p.canvas },
    contentContainer: { flexGrow: 1, paddingHorizontal: 16 },
    profileSection: {
      alignItems: 'center',
      paddingTop: (StatusBar.currentHeight || 0) + 22,
      paddingBottom: 28,
    },
    name: { marginTop: 12 },
    editHint: { marginTop: 6 },
    section: { overflow: 'hidden', marginBottom: 16 },
    menuItemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    menuLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    logoutButton: { marginTop: 22 },
  });

const makeSegStyles = (p: Palette) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 14,
      borderRadius: 10,
      backgroundColor: p.canvas,
      padding: 3,
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 8,
    },
    segmentSelected: {
      backgroundColor: p.surface,
    },
  });

export default SettingsScreen;
