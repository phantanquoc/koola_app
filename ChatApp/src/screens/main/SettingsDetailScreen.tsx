import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import type { PersonalTabStackParamList } from '../../navigation/types';
import { getNotchHeaderHeight } from '../../components/NotchHeader';
import { usePersonalNavHeader } from '../../navigation/PersonalHeaderContext';
import { useAuth } from '../../contexts/AuthContext';
import { usersApi } from '../../services/api/apiService';
import {
  hydrateTranslationPrefs,
  updateTranslationPrefs,
} from '../../services/translation/translationPrefs';
import {
  hydrateNotificationPrefs,
  updateNotificationPrefs,
  useNotificationPrefs,
} from '../../services/notifications/notificationPrefs';
import type { NotificationPrefs } from '../../services/notifications/notificationPrefs';
import {
  KoolaDivider,
  KoolaSegmentedControl,
  KoolaText,
  koolaOpacity,
  koolaRadii,
  koolaSpacing,
  useTheme,
} from '../../ui';
import type { ThemeMode } from '../../ui/theme';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import type { KoolaSegmentedControlOption } from '../../ui/KoolaSegmentedControl';
import { PersonalCard } from './components/personal/PersonalCard';
import { PersonalIconRow } from './components/personal/PersonalIconRow';

const THEME_OPTIONS: KoolaSegmentedControlOption<ThemeMode>[] = [
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
  { value: 'system', label: 'Tự động' },
];

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'Tiếng Anh' },
  { value: 'ja', label: 'Tiếng Nhật' },
  { value: 'ko', label: 'Tiếng Hàn' },
  { value: 'zh', label: 'Tiếng Trung' },
  { value: 'fr', label: 'Tiếng Pháp' },
];

const languageLabel = (code: string): string =>
  LANGUAGE_OPTIONS.find(option => option.value === code)?.label ?? code;

/**
 * Sub-rows under the master "Thông báo" switch. MOCK / UI-only — see caption
 * rendered in the card and services/notifications/notificationPrefs.ts.
 */
const NOTIFICATION_DETAIL_ROWS: { key: keyof NotificationPrefs; icon: string; title: string }[] = [
  { key: 'directMessages', icon: 'chat-bubble-outline', title: 'Tin nhắn cá nhân' },
  { key: 'groupMessages', icon: 'group', title: 'Tin nhắn nhóm' },
  { key: 'momentsMentions', icon: 'star-outline', title: 'Nhắc đến trong Khoảnh khắc' },
  { key: 'shopping', icon: 'shopping-cart', title: 'Mua sắm' },
  { key: 'connect', icon: 'handshake', title: 'Kết nối' },
  { key: 'services', icon: 'category', title: 'Dịch vụ' },
];

const SettingsDetailScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<PersonalTabStackParamList>>();
  const tabBarInset = useTabBarBottomInset();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { tokens, mode, setMode } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  // Takes over the shared NotchHeader band with a back icon + "Cài đặt"
  // title while this screen is focused (see PersonalHeaderContext).
  usePersonalNavHeader('Cài đặt', () => navigation.goBack());

  // NotchHeader is rendered by PersonalTabStack as a fixed sibling that paints
  // above every screen in the stack (zIndex 10). Content starts right below it.
  const scrollPadTop = getNotchHeaderHeight(insets.top, true) + koolaSpacing.sm;

  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.settings?.notificationsEnabled ?? true);
  const [togglingNotify, setTogglingNotify] = useState(false);
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(user?.settings?.autoTranslateEnabled ?? false);
  const [preferredLanguage, setPreferredLanguage] = useState(user?.settings?.preferredLanguage ?? 'vi');
  const [togglingTranslate, setTogglingTranslate] = useState(false);
  const [togglingLanguage, setTogglingLanguage] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const notificationPrefs = useNotificationPrefs();

  useEffect(() => { void hydrateTranslationPrefs(); }, []);
  useEffect(() => { void hydrateNotificationPrefs(); }, []);
  useEffect(() => {
    setAutoTranslateEnabled(user?.settings?.autoTranslateEnabled ?? false);
    setPreferredLanguage(user?.settings?.preferredLanguage ?? 'vi');
  }, [user?.settings?.autoTranslateEnabled, user?.settings?.preferredLanguage]);

  const handleToggleNotify = useCallback(async (value: boolean) => {
    setTogglingNotify(true);
    setNotificationsEnabled(value);
    try { await usersApi.updateSettings({ notificationsEnabled: value }); }
    catch { setNotificationsEnabled(!value); Alert.alert('Lỗi', 'Không thể cập nhật cài đặt thông báo'); }
    finally { setTogglingNotify(false); }
  }, []);

  const handleToggleAutoTranslate = useCallback(async (value: boolean) => {
    setTogglingTranslate(true);
    setAutoTranslateEnabled(value);
    try {
      await updateTranslationPrefs({ autoTranslateEnabled: value });
      await usersApi.updateSettings({ autoTranslateEnabled: value });
    } catch {
      setAutoTranslateEnabled(!value);
      await updateTranslationPrefs({ autoTranslateEnabled: !value }).catch(() => undefined);
      Alert.alert('Lỗi', 'Không thể cập nhật cài đặt dịch tự động');
    } finally { setTogglingTranslate(false); }
  }, []);

  const handleToggleNotificationDetail = useCallback((key: keyof NotificationPrefs, value: boolean) => {
    void updateNotificationPrefs({ [key]: value }).catch(() => undefined);
  }, []);

  const handleSelectLanguage = useCallback(async (value: string) => {
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
    } finally { setTogglingLanguage(false); }
  }, [preferredLanguage]);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingTop: scrollPadTop, paddingBottom: tabBarInset },
        ]}
        showsVerticalScrollIndicator={false}>

        {/* Theme */}
        <PersonalCard>
          <KoolaText variant="label" weight="700" style={styles.cardTitle}>Giao diện</KoolaText>
          <PersonalIconRow icon="palette" title="Chế độ hiển thị" />
          <View style={styles.segmentWrap}>
            <KoolaSegmentedControl<ThemeMode> options={THEME_OPTIONS} value={mode} onChange={setMode} />
          </View>
        </PersonalCard>

        {/* Translation */}
        <PersonalCard>
          <KoolaText variant="label" weight="700" style={styles.cardTitle}>Dịch thuật</KoolaText>
          <PersonalIconRow
            icon="translate"
            title="Dịch tự động"
            subtitle="Tự động dịch tin nhắn đến sang ngôn ngữ ưa thích"
            trailing={
              <Switch
                value={autoTranslateEnabled}
                onValueChange={handleToggleAutoTranslate}
                disabled={togglingTranslate}
                trackColor={{ false: tokens.semantic.border.subtle, true: tokens.semantic.action.primarySoft }}
                thumbColor={autoTranslateEnabled ? tokens.semantic.action.primary : tokens.semantic.text.faint}
              />
            }
          />
          <KoolaDivider style={styles.rowDivider} />
          <PersonalIconRow
            icon="language"
            title="Ngôn ngữ dịch"
            value={togglingLanguage ? 'Đang cập nhật…' : languageLabel(preferredLanguage)}
            onPress={togglingLanguage ? undefined : () => setLanguagePickerVisible(true)}
            showChevron={!togglingLanguage}
            accessibilityLabel={`Ngôn ngữ dịch: ${languageLabel(preferredLanguage)}`}
          />
        </PersonalCard>

        {/* Notifications */}
        <PersonalCard>
          <KoolaText variant="label" weight="700" style={styles.cardTitle}>Thông báo</KoolaText>
          <PersonalIconRow
            icon="notifications-none"
            title="Thông báo"
            trailing={
              <Switch
                value={notificationsEnabled}
                onValueChange={handleToggleNotify}
                disabled={togglingNotify}
                trackColor={{ false: tokens.semantic.border.subtle, true: tokens.semantic.action.primarySoft }}
                thumbColor={notificationsEnabled ? tokens.semantic.action.primary : tokens.semantic.text.faint}
              />
            }
          />
          {notificationsEnabled && (
            <>
              <KoolaDivider style={styles.rowDivider} />
              <KoolaText variant="caption" tone="muted" style={styles.notificationPreviewCaption}>
                Các mục chi tiết đang là bản xem trước, chưa có hiệu lực.
              </KoolaText>
              {NOTIFICATION_DETAIL_ROWS.map((row, index) => (
                <React.Fragment key={row.key}>
                  {index > 0 && <KoolaDivider style={styles.rowDivider} />}
                  <PersonalIconRow
                    icon={row.icon}
                    title={row.title}
                    trailing={
                      <Switch
                        value={notificationPrefs[row.key]}
                        onValueChange={(value) => handleToggleNotificationDetail(row.key, value)}
                        trackColor={{ false: tokens.semantic.border.subtle, true: tokens.semantic.action.primarySoft }}
                        thumbColor={notificationPrefs[row.key] ? tokens.semantic.action.primary : tokens.semantic.text.faint}
                        accessibilityLabel={row.title}
                      />
                    }
                  />
                </React.Fragment>
              ))}
            </>
          )}
        </PersonalCard>

        {/* About & cache */}
        <PersonalCard>
          <KoolaText variant="label" weight="700" style={styles.cardTitle}>Khác</KoolaText>
          <PersonalIconRow
            icon="lock-outline"
            title="Quyền riêng tư"
            onPress={() => Alert.alert('Quyền riêng tư', 'Dữ liệu của bạn được lưu trữ an toàn trên máy chủ.\n\nTin nhắn được mã hóa khi truyền qua TLS.\n\nMã hóa đầu cuối đang được phát triển.')}
          />
          <KoolaDivider style={styles.rowDivider} />
          <PersonalIconRow
            icon="info-outline"
            title="Giới thiệu"
            onPress={() => Alert.alert('Về Koola Chat', 'Phiên bản 1.0.0\n\nXây dựng bằng React Native + NestJS\n\n© 2026 Koola Chat')}
          />
          <KoolaDivider style={styles.rowDivider} />
          <PersonalIconRow
            icon="storage"
            title="Bộ nhớ đệm"
            onPress={() => navigation.navigate('StorageSettings')}
          />
        </PersonalCard>
      </ScrollView>

      {/* Language picker bottom sheet — same as before, now owned here */}
      {languagePickerVisible && (
        <Pressable
          style={styles.languageOverlay}
          onPress={() => setLanguagePickerVisible(false)}
          accessible={false}>
          <View
            style={[styles.languageSheet, { paddingBottom: koolaSpacing.lg + insets.bottom }]}
            onStartShouldSetResponder={() => true}>
            <View style={styles.languageHandle} />
            <KoolaText variant="label" weight="800" align="center" style={styles.languageTitle}>Chọn ngôn ngữ</KoolaText>
            {LANGUAGE_OPTIONS.map(option => {
              const selected = option.value === preferredLanguage;
              return (
                <PersonalIconRow
                  key={option.value}
                  icon="translate"
                  title={option.label}
                  accent={selected}
                  selected={selected}
                  showChevron={false}
                  onPress={() => handleSelectLanguage(option.value)}
                  trailing={selected ? <MaterialIcons name="check" size={20} color={tokens.semantic.action.primary} /> : null}
                />
              );
            })}
            <Pressable
              onPress={() => setLanguagePickerVisible(false)}
              // Style-as-function carries press feedback only — RN 0.76 drops
              // layout props passed through this callback.
              style={({ pressed }) => (pressed ? styles.languageCancelPressed : null)}>
              <View style={styles.languageCancel}>
                <KoolaText variant="label" tone="muted" align="center">Đóng</KoolaText>
              </View>
            </Pressable>
          </View>
        </Pressable>
      )}
    </View>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    root: { flex: 1 },
    scroll: { flex: 1 },
    contentContainer: { flexGrow: 1, paddingBottom: koolaSpacing.lg },
    cardTitle: { marginBottom: koolaSpacing.sm },
    rowDivider: { marginVertical: koolaSpacing.sm },
    notificationPreviewCaption: { marginBottom: koolaSpacing.sm },
    segmentWrap: { paddingTop: koolaSpacing.xs },
    languageOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: semantic.surface.overlay, zIndex: 10 },
    languageSheet: { backgroundColor: semantic.surface.level1, borderTopLeftRadius: koolaRadii.lg, borderTopRightRadius: koolaRadii.lg, paddingTop: koolaSpacing.sm, paddingHorizontal: koolaSpacing.lg },
    languageHandle: { width: 36, height: 4, borderRadius: koolaRadii.pill, backgroundColor: semantic.border.subtle, alignSelf: 'center', marginBottom: koolaSpacing.sm },
    languageTitle: { marginBottom: koolaSpacing.sm },
    languageCancel: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: koolaSpacing.sm, borderRadius: koolaRadii.md, backgroundColor: semantic.surface.level2, borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.border.subtle },
    languageCancelPressed: { opacity: koolaOpacity.pressed },
  });

export default SettingsDetailScreen;
