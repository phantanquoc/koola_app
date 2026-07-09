import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import type { PersonalTabStackParamList } from '../../navigation/types';
import {
  KoolaButton,
  KoolaDivider,
  KoolaSurface,
  KoolaText,
  koolaRadii,
  koolaSpacing,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';
import * as mediaIndexService from '../../services/media/mediaIndexService';
import { isLocalFirstEnabled } from '../../config/featureFlags';
import { isDataSaverEnabled, setDataSaver } from '../../services/media/mediaPreloader';

// ─── Cap options (GB) ─────────────────────────────────────────────────────────
const CAP_OPTIONS_GB = [1, 2, 5, 10, 20];
const GB = 1024 * 1024 * 1024;

const StorageSettingsScreen: React.FC = () => {
  const tabBarInset = useTabBarBottomInset();
  const navigation =
    useNavigation<NativeStackNavigationProp<PersonalTabStackParamList>>();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        { paddingBottom: tabBarInset },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Quay lại">
          <MaterialIcons name="arrow-back" size={24} color={palette.primary} />
        </Pressable>
        <KoolaText variant="heading">Bộ nhớ đệm</KoolaText>
      </View>

      <KoolaSurface variant="raised" style={styles.section}>
        <View style={styles.menuItemRow}>
          <View style={styles.menuLabelRow}>
            <MaterialIcons name="storage" size={22} color={palette.primary} />
            <KoolaText variant="label">Bộ nhớ đệm media</KoolaText>
          </View>
        </View>
        <KoolaDivider />
        <View style={styles.storageRow}>
          <KoolaText tone="muted" variant="caption">
            Đã dùng: {formatBytes(usedBytes)} / {formatBytes(capBytes)}
          </KoolaText>
          {/* Usage meter */}
          <View style={styles.meterTrack}>
            <View
              style={[
                styles.meterFill,
                { width: `${Math.min((usedBytes / capBytes) * 100, 100)}%` },
                usedBytes / capBytes > 0.85 && styles.meterFillWarning,
              ]}
            />
          </View>
        </View>
        <KoolaDivider />
        <Pressable
          style={styles.menuItem}
          onPress={handleChangeCap}
          accessibilityRole="button"
          accessibilityLabel="Thay đổi giới hạn bộ nhớ đệm">
          <View style={styles.menuLabelRow}>
            <MaterialIcons name="tune" size={22} color={palette.primary} />
            <KoolaText variant="label">Giới hạn: {formatBytes(capBytes)}</KoolaText>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={palette.faint} />
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
            <MaterialIcons name="data-saver-on" size={22} color={palette.primary} />
            <KoolaText variant="label">Tiết kiệm dữ liệu (bỏ qua tải trước media)</KoolaText>
          </View>
          <Switch
            value={dataSaver}
            onValueChange={handleToggleDataSaver}
            trackColor={{ false: palette.line, true: palette.primarySoft }}
            thumbColor={dataSaver ? palette.primary : palette.faint}
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
    </ScrollView>
  );
};

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.canvas,
    },
    contentContainer: {
      flexGrow: 1,
      paddingHorizontal: koolaSpacing.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 14,
      paddingBottom: 18,
    },
    backBtn: {
      padding: 4,
    },
    section: {
      overflow: 'hidden',
    },
    menuItemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: koolaSpacing.lg,
      paddingVertical: 13,
    },
    menuItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: koolaSpacing.lg,
      paddingVertical: koolaSpacing.lg,
    },
    menuLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    storageRow: {
      paddingHorizontal: koolaSpacing.lg,
      paddingVertical: 10,
    },
    meterTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: p.line,
      marginTop: koolaSpacing.sm,
      overflow: 'hidden',
    },
    meterFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: p.primary,
    },
    meterFillWarning: {
      backgroundColor: p.warning,
    },
    clearCacheButton: {
      margin: 12,
    },
  });

export default StorageSettingsScreen;
