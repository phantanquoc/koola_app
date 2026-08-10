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
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import type { PersonalTabStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { usersApi } from '../../services/api/apiService';
import UserAvatar from '../../components/UserAvatar';
import {
  KoolaButton,
  KoolaDivider,
  KoolaListItem,
  KoolaText,
  KoolaSegmentedControl,
  useTheme,
} from '../../ui';
import type { ThemeMode } from '../../ui/theme';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import type { KoolaSegmentedControlOption } from '../../ui/KoolaSegmentedControl';

// ─── Theme options for KoolaSegmentedControl ────────────────────────────────

const THEME_OPTIONS: KoolaSegmentedControlOption<ThemeMode>[] = [
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
  { value: 'system', label: 'Tự động' },
];

// ─── Main Screen ─────────────────────────────────────────────────────────────

const SettingsScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const tabBarInset = useTabBarBottomInset();
  const navigation =
    useNavigation<NativeStackNavigationProp<PersonalTabStackParamList>>();
  const { tokens, mode, setMode } = useTheme();
  const styles = useMemo(() => makeScreenStyles(tokens.semantic), [tokens.semantic]);
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
        accessibilityRole="button"
        accessibilityLabel="Chỉnh sửa hồ sơ">
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
      <View style={styles.section}>
        <KoolaListItem
          title="Giao diện"
          icon="palette"
        />
        <View style={styles.segmentWrap}>
          <KoolaSegmentedControl<ThemeMode>
            options={THEME_OPTIONS}
            value={mode}
            onChange={setMode}
          />
        </View>
      </View>

      <View style={styles.section}>
        <KoolaListItem
          title="Danh sách tài khoản"
          icon="account-circle"
          onPress={() => navigation.navigate('AccountList')}
        />
        <KoolaDivider />
        <KoolaListItem
          title="Thông báo"
          icon="notifications-none"
          trailing={
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              disabled={toggling}
              trackColor={{ false: tokens.semantic.border.subtle, true: tokens.semantic.action.primarySoft }}
              thumbColor={notificationsEnabled ? tokens.semantic.action.primary : tokens.semantic.text.faint}
            />
          }
          showChevron={false}
        />
        <KoolaDivider />
        <KoolaListItem
          title="Quyền riêng tư"
          icon="lock-outline"
          onPress={() => Alert.alert('Quyền riêng tư', 'Dữ liệu của bạn được lưu trữ an toàn trên máy chủ.\n\nTin nhắn được mã hóa khi truyền qua TLS.\n\nMã hóa đầu cuối đang được phát triển.')}
        />
        <KoolaDivider />
        <KoolaListItem
          title="Giới thiệu"
          icon="info-outline"
          onPress={() => Alert.alert('Về Koola Chat', 'Phiên bản 1.0.0\n\nXây dựng bằng React Native + NestJS\n\n© 2026 Koola Chat')}
        />
        <KoolaDivider />
        <KoolaListItem
          title="Bộ nhớ đệm"
          icon="storage"
          onPress={() => navigation.navigate('StorageSettings')}
        />
      </View>

      <KoolaButton
        title="Đăng xuất"
        icon="logout"
        variant="danger"
        onPress={logout}
        style={styles.logoutButton}
      />

      {/* __DEV__ only — Logo Lab playground for 3D variant experiments */}
      {__DEV__ && (
        <View style={styles.section}>
          <KoolaListItem
            title="[DEV] Logo Lab"
            icon="science"
            onPress={() => (navigation as any).navigate('ChatTab', { screen: 'LogoLab' })}
          />
          <KoolaListItem
            title="[DEV] Moments Feed Lab"
            icon="dynamic-feed"
            onPress={() =>
              (navigation as any).navigate('ChatTab', { screen: 'MomentsFeedLab' })
            }
          />
        </View>
      )}
    </ScrollView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeScreenStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: semantic.bg.canvas },
    contentContainer: { flexGrow: 1 },
    profileSection: {
      alignItems: 'center',
      paddingTop: (StatusBar.currentHeight || 0) + 22,
      paddingBottom: 28,
      paddingHorizontal: 24,
    },
    name: { marginTop: 12 },
    editHint: { marginTop: 6 },
    section: {
      overflow: 'hidden',
      marginBottom: 24,
      backgroundColor: semantic.surface.level1,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
    },
    segmentWrap: { paddingHorizontal: 16, paddingBottom: 14 },
    logoutButton: { marginTop: 8, marginHorizontal: 16 },
  });

export default SettingsScreen;
