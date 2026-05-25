import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Pressable,
  StatusBar,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
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
import * as mediaIndexService from '../../services/media/mediaIndexService';
import { isLocalFirstEnabled } from '../../config/featureFlags';
import { isDataSaverEnabled, setDataSaver } from '../../services/media/mediaPreloader';

// ─── Cap options (GB) ─────────────────────────────────────────────────────────
const CAP_OPTIONS_GB = [1, 2, 5, 10, 20];
const GB = 1024 * 1024 * 1024;

const SettingsScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<PersonalTabStackParamList>>();
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user?.settings?.notificationsEnabled ?? true,
  );
  const [toggling, setToggling] = useState(false);

  // ─── Storage section state (task 5.8) ─────────────────────────────────────
  const [usedBytes, setUsedBytes] = useState(0);
  const [clearingCache, setClearingCache] = useState(false);
  const [capBytes, setCapBytesState] = useState(() => mediaIndexService.getCapBytes());
  const [dataSaver, setDataSaverState] = useState(() => isDataSaverEnabled());

  const refreshUsedBytes = useCallback(() => {
    let total = 0;
    for (const [, entry] of mediaIndexService.iterate()) {
      total += entry.size;
    }
    setUsedBytes(total);
  }, []);

  useEffect(() => {
    refreshUsedBytes();
  }, [refreshUsedBytes]);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  const handleClearCache = async () => {
    Alert.alert(
      'Xóa bộ nhớ đệm',
      'Tất cả file media đã tải về sẽ bị xóa. Bạn có chắc không?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            setClearingCache(true);
            try {
              await mediaIndexService.clearAll();
              refreshUsedBytes();
            } catch (err) {
              Alert.alert('Lỗi', 'Không thể xóa bộ nhớ đệm');
            } finally {
              setClearingCache(false);
            }
          },
        },
      ],
    );
  };

  // Task 6.2: update cap and trigger immediate eviction if usage exceeds new cap
  const handleChangeCap = () => {
    const options = CAP_OPTIONS_GB.map((gb) => `${gb} GB`);
    Alert.alert(
      'Giới hạn bộ nhớ đệm',
      'Chọn dung lượng tối đa cho bộ nhớ đệm media:',
      [
        ...options.map((label, i) => ({
          text: label,
          onPress: () => {
            const newCap = mediaIndexService.setCapBytes(CAP_OPTIONS_GB[i] * GB);
            setCapBytesState(newCap);
            // Trigger immediate eviction if current usage exceeds new cap
            mediaIndexService.evictIfNeeded(newCap).catch(() => {});
            refreshUsedBytes();
          },
        })),
        { text: 'Hủy', style: 'cancel' },
      ],
    );
  };

  const handleToggleDataSaver = (value: boolean) => {
    setDataSaverState(value);
    setDataSaver(value);
  };

  const handleToggleNotifications = async (value: boolean) => {    setToggling(true);
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
    <View style={styles.container}>
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
      </KoolaSurface>

      {/* Storage section (task 5.8) */}
      <KoolaSurface variant="raised" style={[styles.section, styles.storageSection]}>
        <View style={styles.menuItemRow}>
          <View style={styles.menuLabelRow}>
            <MaterialIcons name="storage" size={22} color={koolaColors.primary} />
            <KoolaText variant="label">Bộ nhớ đệm media</KoolaText>
          </View>
        </View>
        <KoolaDivider />
        <View style={styles.storageRow}>
          <KoolaText tone="muted" variant="caption">
            Đã dùng: {formatBytes(usedBytes)} / {formatBytes(capBytes)}
          </KoolaText>
        </View>
        <KoolaDivider />
        <Pressable
          style={styles.menuItem}
          onPress={handleChangeCap}
          accessibilityRole="button"
          accessibilityLabel="Thay đổi giới hạn bộ nhớ đệm">
          <View style={styles.menuLabelRow}>
            <MaterialIcons name="tune" size={22} color={koolaColors.primary} />
            <KoolaText variant="label">Giới hạn: {formatBytes(capBytes)}</KoolaText>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={koolaColors.faint} />
        </Pressable>
        {isLocalFirstEnabled() && (
          <>
            <KoolaDivider />
            <View style={styles.storageRow}>
              <KoolaText tone="muted" variant="caption">
                Tin nhắn: SQLite (local-first)
              </KoolaText>
            </View>
          </>
        )}
        <KoolaDivider />
        <View style={styles.menuItemRow}>
          <View style={styles.menuLabelRow}>
            <MaterialIcons name="data-saver-on" size={22} color={koolaColors.primary} />
            <KoolaText variant="label">Tiết kiệm dữ liệu (bỏ qua tải trước media)</KoolaText>
          </View>
          <Switch
            value={dataSaver}
            onValueChange={handleToggleDataSaver}
            trackColor={{ false: '#D0D5DD', true: '#93C5FD' }}
            thumbColor={dataSaver ? koolaColors.primary : '#F2F4F7'}
            accessibilityLabel="Tiết kiệm dữ liệu"
          />
        </View>
        <KoolaDivider />
        <KoolaButton
          title={clearingCache ? 'Đang xóa...' : 'Xóa bộ nhớ đệm'}
          icon="delete-outline"
          variant="secondary"
          onPress={handleClearCache}
          disabled={clearingCache}
          style={styles.clearCacheButton}
          accessibilityLabel="Xóa bộ nhớ đệm media"
        />
      </KoolaSurface>

      <KoolaButton
        title="Đăng xuất"
        icon="logout"
        variant="danger"
        onPress={logout}
        style={styles.logoutButton}
      />
    </View>
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
  storageSection: {
    marginTop: 16,
    overflow: 'hidden',
  },
  storageRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  clearCacheButton: {
    margin: 12,
  },
});

export default SettingsScreen;
