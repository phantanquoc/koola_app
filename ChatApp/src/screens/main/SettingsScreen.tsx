import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import type { PersonalTabStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { usersApi } from '../../services/api/apiService';
import UserAvatar from '../../components/UserAvatar';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
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
import {
  hydrateTranslationPrefs,
  updateTranslationPrefs,
} from '../../services/translation/translationPrefs';

// ─── Theme options for KoolaSegmentedControl ────────────────────────────────

const THEME_OPTIONS: KoolaSegmentedControlOption<ThemeMode>[] = [
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
  { value: 'system', label: 'Tự động' },
];

// ─── Translation language options (ISO 639-1 → display label) ───────────────

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'Tiếng Anh' },
  { value: 'ja', label: 'Tiếng Nhật' },
  { value: 'ko', label: 'Tiếng Hàn' },
  { value: 'zh', label: 'Tiếng Trung' },
  { value: 'fr', label: 'Tiếng Pháp' },
];

const languageLabel = (code: string): string =>
  LANGUAGE_OPTIONS.find((option) => option.value === code)?.label ?? code;

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

  // ─── Translation prefs (task 4.3) ──────────────────────────────────────────
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(
    user?.settings?.autoTranslateEnabled ?? false,
  );
  const [preferredLanguage, setPreferredLanguage] = useState(
    user?.settings?.preferredLanguage ?? 'vi',
  );
  const [togglingTranslate, setTogglingTranslate] = useState(false);
  const [togglingLanguage, setTogglingLanguage] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);

  // Hydrate local storage into the external translationPrefs store and sync
  // local state from authoritative user.settings on mount / when user changes.
  useEffect(() => {
    void hydrateTranslationPrefs();
  }, []);
  useEffect(() => {
    setAutoTranslateEnabled(user?.settings?.autoTranslateEnabled ?? false);
    setPreferredLanguage(user?.settings?.preferredLanguage ?? 'vi');
  }, [user?.settings?.autoTranslateEnabled, user?.settings?.preferredLanguage]);

  const handleToggleAutoTranslate = async (value: boolean) => {
    setTogglingTranslate(true);
    setAutoTranslateEnabled(value);
    try {
      await updateTranslationPrefs({ autoTranslateEnabled: value });
      await usersApi.updateSettings({ autoTranslateEnabled: value });
    } catch {
      setAutoTranslateEnabled(!value);
      await updateTranslationPrefs({ autoTranslateEnabled: !value }).catch(() => undefined);
      Alert.alert('Lỗi', 'Không thể cập nhật cài đặt dịch tự động');
    } finally {
      setTogglingTranslate(false);
    }
  };

  const handleSelectLanguage = async (value: string) => {
    const previous = preferredLanguage;
    setLanguagePickerVisible(false);
    setTogglingLanguage(true);
    setPreferredLanguage(value);
    try {
      await updateTranslationPrefs({ preferredLanguage: value });
      await usersApi.updateSettings({ preferredLanguage: value });
    } catch {
      setPreferredLanguage(previous);
      await updateTranslationPrefs({ preferredLanguage: previous }).catch(() => undefined);
      Alert.alert('Lỗi', 'Không thể cập nhật ngôn ngữ dịch');
    } finally {
      setTogglingLanguage(false);
    }
  };

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

      {/* Translation prefs — auto-translate toggle + preferred language picker */}
      <View style={styles.section}>
        <KoolaListItem
          title="Dịch tự động"
          subtitle="Tự động dịch tin nhắn đến sang ngôn ngữ ưa thích"
          icon="translate"
          trailing={
            <Switch
              value={autoTranslateEnabled}
              onValueChange={handleToggleAutoTranslate}
              disabled={togglingTranslate}
              trackColor={{ false: tokens.semantic.border.subtle, true: tokens.semantic.action.primarySoft }}
              thumbColor={autoTranslateEnabled ? tokens.semantic.action.primary : tokens.semantic.text.faint}
            />
          }
          showChevron={false}
        />
        <KoolaDivider />
        <KoolaListItem
          title="Ngôn ngữ dịch"
          subtitle={togglingLanguage ? 'Đang cập nhật…' : languageLabel(preferredLanguage)}
          icon="language"
          disabled={togglingLanguage}
          onPress={() => setLanguagePickerVisible(true)}
          accessibilityLabel={`Ngôn ngữ dịch: ${languageLabel(preferredLanguage)}`}
        />
      </View>

      {/* Language picker — bottom sheet modal */}
      <Modal
        visible={languagePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguagePickerVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setLanguagePickerVisible(false)}>
          <View style={styles.languageOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.languageSheet}>
                <View style={styles.languageHandle} />
                <KoolaText variant="label" weight="800" align="center" style={styles.languageTitle}>
                  Chọn ngôn ngữ
                </KoolaText>
                {LANGUAGE_OPTIONS.map((option) => {
                  const selected = option.value === preferredLanguage;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => handleSelectLanguage(option.value)}
                      style={({ pressed }) => [
                        styles.languageOption,
                        selected && styles.languageOptionSelected,
                        pressed && styles.languageOptionPressed,
                      ]}>
                      <KoolaText
                        variant="body"
                        tone={selected ? 'primary' : 'ink'}
                        weight={selected ? '800' : '500'}>
                        {option.label}
                      </KoolaText>
                      {selected ? (
                        <MaterialIcons
                          name="check"
                          size={20}
                          color={tokens.semantic.action.primary}
                          style={styles.languageCheck}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => setLanguagePickerVisible(false)}
                  style={({ pressed }) => [styles.languageCancel, pressed && styles.languageOptionPressed]}>
                  <KoolaText variant="label" tone="muted" align="center">Đóng</KoolaText>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

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
    languageOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    languageSheet: {
      backgroundColor: semantic.surface.level1,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingBottom: 20,
      paddingTop: 8,
    },
    languageHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: semantic.border.subtle,
      alignSelf: 'center',
      marginBottom: 10,
    },
    languageTitle: { marginBottom: 6 },
    languageOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 52,
      paddingHorizontal: 20,
    },
    languageOptionSelected: {
      backgroundColor: semantic.action.primarySoft,
    },
    languageOptionPressed: {
      opacity: 0.6,
    },
    languageCheck: { marginLeft: 12 },
    languageCancel: {
      minHeight: 48,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 8,
      marginHorizontal: 16,
      borderRadius: 12,
      backgroundColor: semantic.surface.level2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
    },
  });

export default SettingsScreen;
