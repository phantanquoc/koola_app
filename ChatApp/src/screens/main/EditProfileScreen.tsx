import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Clipboard from '@react-native-clipboard/clipboard';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { usersApi } from '../../services/api/apiService';
import { pickImage, uploadMedia } from '../../services/media/mediaUploadService';
import { getOrDownload } from '../../services/media/mediaCacheService';
import UserAvatar from '../../components/UserAvatar';
import {
  KoolaDivider,
  KoolaIconButton,
  KoolaSurface,
  KoolaText,
  koolaColors,
  koolaRadii,
  koolaShadows,
  koolaSpacing,
} from '../../ui';
import { DisplayNameSheet } from './components/edit-profile/DisplayNameSheet';
import { BioSheet } from './components/edit-profile/BioSheet';
import { UsernameSheet } from './components/edit-profile/UsernameSheet';
import { PhoneSheet } from './components/edit-profile/PhoneSheet';
import { DateOfBirthSheet } from './components/edit-profile/DateOfBirthSheet';
import { GenderSheet } from './components/edit-profile/GenderSheet';

// ─── Gender label mapping ───

const GENDER_LABELS: Record<string, string> = {
  male: 'Nam',
  female: 'Nữ',
  other: 'Khác',
  prefer_not: 'Không nêu',
};

type SheetType =
  | 'displayName'
  | 'bio'
  | 'username'
  | 'phone'
  | 'dateOfBirth'
  | 'gender'
  | null;

const EditProfileScreen: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [coverUri, setCoverUri] = useState<string | null>(null);

  // Resolve cover photo media key to local URI for the hero band background
  useEffect(() => {
    if (user?.coverPhoto) {
      getOrDownload(user.coverPhoto)
        .then((uri) => setCoverUri(uri))
        .catch(() => setCoverUri(null));
    } else {
      setCoverUri(null);
    }
  }, [user?.coverPhoto]);

  const pickAndUploadCover = async () => {
    try {
      const picked = await pickImage();
      if (!picked) return;
      if (picked === 'TOO_LARGE') {
        Alert.alert('Lỗi', 'Ảnh vượt quá dung lượng tối đa');
        return;
      }
      setUploadingCover(true);
      const result = await uploadMedia(
        picked.uri,
        picked.filename,
        picked.mimeType,
        picked.size,
      );
      await usersApi.updateMe({ coverPhoto: result.mediaKey });
      await refreshUser();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      Alert.alert('Lỗi', error.response?.data?.message || 'Không thể tải ảnh bìa');
    } finally {
      setUploadingCover(false);
    }
  };

  const handlePickCover = () => {
    if (user?.coverPhoto) {
      (navigation.getParent() as any)?.navigate('CoverPhotoViewer', { mediaKey: user.coverPhoto });
    } else {
      pickAndUploadCover();
    }
  };

  const handlePickAvatar = async () => {
    try {
      const picked = await pickImage();
      if (!picked) return;
      if (picked === 'TOO_LARGE') {
        Alert.alert('Lỗi', 'Ảnh vượt quá dung lượng tối đa');
        return;
      }
      setUploadingAvatar(true);
      const result = await uploadMedia(
        picked.uri,
        picked.filename,
        picked.mimeType,
        picked.size,
      );
      await usersApi.updateMe({ avatar: result.mediaKey });
      await refreshUser();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      Alert.alert('Lỗi', error.response?.data?.message || 'Không thể tải ảnh đại diện');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCopyEmail = () => {
    if (user?.email) {
      Clipboard.setString(user.email);
      Alert.alert('Đã sao chép', 'Email đã được sao chép vào clipboard');
    }
  };

  const formatDob = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  return (
    <View style={styles.container}>
      {/* Custom header — controls top inset precisely */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            android_ripple={{ color: koolaColors.line, borderless: true, radius: 22 }}
            style={({ pressed }) => [styles.headerBack, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel="Quay lại">
            <MaterialIcons name="arrow-back" size={24} color={koolaColors.ink} />
          </Pressable>
          <KoolaText variant="heading" weight="700" style={styles.headerTitle} numberOfLines={1}>
            Chỉnh sửa hồ sơ
          </KoolaText>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        {/* Hero — cover band + info card with avatar sticker */}
        <View style={styles.heroWrap}>
          <View style={styles.heroBandWrap}>
            <View style={styles.heroBand}>
              {coverUri ? (
                <Image
                  source={{ uri: coverUri }}
                  style={styles.heroBandImage}
                  resizeMode="cover"
                />
              ) : (
                <FakeGradientBand />
              )}
              <View style={styles.heroBandOverlay} />
              {!coverUri && !uploadingCover ? (
                <View style={styles.heroBandPrompt} pointerEvents="none">
                  <View style={styles.heroBandPromptIcon}>
                    <MaterialIcons
                      name="add-photo-alternate"
                      size={20}
                      color={koolaColors.primary}
                    />
                  </View>
                  <KoolaText
                    variant="caption"
                    weight="600"
                    tone="primary"
                    style={styles.heroBandPromptText}>
                    Thêm ảnh bìa
                  </KoolaText>
                </View>
              ) : null}
              {uploadingCover ? (
                <View
                  style={coverUri ? styles.heroBandLoadingDim : styles.heroBandLoading}
                  pointerEvents="none">
                  <ActivityIndicator color={coverUri ? koolaColors.surface : koolaColors.primary} />
                </View>
              ) : null}
              <Pressable
                onPress={handlePickCover}
                disabled={uploadingCover}
                android_ripple={{ color: koolaColors.primarySoft }}
                style={styles.heroBandTouchable}
                accessibilityRole="button"
                accessibilityLabel={coverUri ? 'Đổi ảnh bìa' : 'Thêm ảnh bìa'}
              />
            </View>
          </View>

          <KoolaSurface variant="raised" style={styles.heroInfoCard}>
            {/* Avatar — absolute, straddles the band/card seam */}
            <Pressable
              onPress={handlePickAvatar}
              disabled={uploadingAvatar}
              hitSlop={4}
              style={styles.avatarPressable}
              accessibilityRole="button"
              accessibilityLabel="Đổi ảnh đại diện">
              <View style={styles.avatarRing}>
                <UserAvatar
                  displayName={user?.displayName || '?'}
                  avatar={user?.avatar || undefined}
                  size={AVATAR_SIZE}
                />
              </View>
              {uploadingAvatar ? (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color={koolaColors.surface} />
                </View>
              ) : (
                <View style={styles.avatarCameraBadge}>
                  <MaterialIcons name="photo-camera" size={16} color={koolaColors.surface} />
                </View>
              )}
            </Pressable>

            <KoolaText variant="title" weight="800" style={styles.heroName} numberOfLines={1}>
              {user?.displayName || '—'}
            </KoolaText>
            <KoolaText variant="caption" tone="muted" style={styles.heroUsername} numberOfLines={1}>
              {user?.username ? `@${user.username}` : 'Chưa đặt tên người dùng'}
            </KoolaText>
          </KoolaSurface>
        </View>

        {/* Section: THÔNG TIN CƠ BẢN */}
        <SectionHeader label="Thông tin cơ bản" />
        <KoolaSurface variant="raised" style={styles.sectionCard}>
          <SettingRow
            icon="badge"
            label="Tên hiển thị"
            value={user?.displayName || ''}
            onPress={() => setActiveSheet('displayName')}
          />
          <SettingRow
            icon="alternate-email"
            label="Tên người dùng"
            value={user?.username ? `@${user.username}` : ''}
            placeholder="Chưa đặt"
            onPress={() => setActiveSheet('username')}
          />
          <SettingRow
            icon="short-text"
            label="Giới thiệu"
            value={user?.bio || ''}
            placeholder="Thêm giới thiệu"
            onPress={() => setActiveSheet('bio')}
            last
          />
        </KoolaSurface>

        {/* Section: TÀI KHOẢN */}
        <SectionHeader label="Tài khoản" />
        <KoolaSurface variant="raised" style={styles.sectionCard}>
          <SettingRow
            icon="mail-outline"
            label="Email"
            value={user?.email || ''}
            subValue={
              <View style={styles.verifiedRow}>
                <MaterialIcons
                  name="verified"
                  size={14}
                  color={koolaColors.success}
                  style={styles.verifiedIcon}
                />
                <KoolaText variant="caption" weight="700" tone="success">
                  Đã xác thực
                </KoolaText>
              </View>
            }
            trailing={
              <KoolaIconButton
                icon="content-copy"
                tone="muted"
                variant="ghost"
                size={36}
                iconSize={18}
                onPress={handleCopyEmail}
                accessibilityLabel="Sao chép email"
              />
            }
          />
          <KoolaDivider style={styles.rowDivider} />
          <SettingRow
            icon="phone-iphone"
            label="Số điện thoại"
            value={user?.phone || ''}
            placeholder="Thêm số điện thoại"
            onPress={() => setActiveSheet('phone')}
            last
          />
        </KoolaSurface>

        {/* Section: CÁ NHÂN */}
        <SectionHeader label="Cá nhân" />
        <KoolaSurface variant="raised" style={styles.sectionCard}>
          <SettingRow
            icon="cake"
            label="Ngày sinh"
            value={formatDob(user?.dateOfBirth)}
            placeholder="Chưa đặt"
            onPress={() => setActiveSheet('dateOfBirth')}
          />
          <SettingRow
            icon="wc"
            label="Giới tính"
            value={user?.gender ? GENDER_LABELS[user.gender] || '' : ''}
            placeholder="Chưa đặt"
            onPress={() => setActiveSheet('gender')}
            last
          />
        </KoolaSurface>
      </ScrollView>

      {/* Sheets */}
      <DisplayNameSheet
        visible={activeSheet === 'displayName'}
        onClose={() => setActiveSheet(null)}
      />
      <BioSheet
        visible={activeSheet === 'bio'}
        onClose={() => setActiveSheet(null)}
      />
      <UsernameSheet
        visible={activeSheet === 'username'}
        onClose={() => setActiveSheet(null)}
      />
      <PhoneSheet
        visible={activeSheet === 'phone'}
        onClose={() => setActiveSheet(null)}
      />
      <DateOfBirthSheet
        visible={activeSheet === 'dateOfBirth'}
        onClose={() => setActiveSheet(null)}
      />
      <GenderSheet
        visible={activeSheet === 'gender'}
        onClose={() => setActiveSheet(null)}
      />
    </View>
  );
};

// ─── FakeGradientBand ───
// Stacked translucent white bands faking a primarySoft→surface fade.
// No gradient lib available — 1px overlap prevents seams (ui-dna.md:70).
const FakeGradientBand: React.FC = () => (
  <>
    <View style={StyleSheet.absoluteFillObject as object} />
    <View style={gradBandStyles.band1} />
    <View style={gradBandStyles.band2} />
    <View style={gradBandStyles.band3} />
    <View style={gradBandStyles.band4} />
    <View style={gradBandStyles.band5} />
  </>
);

const gradBandStyles = StyleSheet.create({
  band1: { ...StyleSheet.absoluteFillObject, backgroundColor: koolaColors.primarySoft },
  band2: { position: 'absolute', left: 0, right: 0, top: '25%', bottom: -1, backgroundColor: 'rgba(255,255,255,0.25)' },
  band3: { position: 'absolute', left: 0, right: 0, top: '50%', bottom: -1, backgroundColor: 'rgba(255,255,255,0.5)' },
  band4: { position: 'absolute', left: 0, right: 0, top: '70%', bottom: -1, backgroundColor: 'rgba(255,255,255,0.7)' },
  band5: { position: 'absolute', left: 0, right: 0, top: '85%', bottom: 0, backgroundColor: 'rgba(255,255,255,0.85)' },
});

// ─── SectionHeader ───

const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <View style={styles.sectionHeader}>
    <KoolaText variant="caption" weight="700" tone="muted" style={styles.sectionLabel}>
      {label.toUpperCase()}
    </KoolaText>
  </View>
);

// ─── SettingRow ───

interface SettingRowProps {
  icon: string;
  label: string;
  value: string;
  placeholder?: string;
  onPress?: () => void;
  last?: boolean;
  trailing?: React.ReactNode;
  subValue?: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({
  icon,
  label,
  value,
  placeholder,
  onPress,
  last,
  trailing,
  subValue,
}) => {
  const interactive = typeof onPress === 'function';

  const inner = (pressed: boolean) => (
    <View style={[styles.row, pressed && styles.rowPressed]}>
      <View style={styles.iconShell}>
        <MaterialIcons name={icon} size={20} color={koolaColors.muted} />
      </View>
      <View style={styles.rowText}>
        <KoolaText variant="label" weight="500" tone="muted">
          {label}
        </KoolaText>
        <KoolaText
          variant="body"
          weight={value ? '500' : '400'}
          tone={value ? 'ink' : 'faint'}
          numberOfLines={1}
          style={styles.rowValue}>
          {value || placeholder || ''}
        </KoolaText>
        {subValue ? <View style={styles.rowSubValue}>{subValue}</View> : null}
      </View>
      <View style={styles.rowChevron}>
        {trailing !== undefined ? (
          trailing
        ) : interactive ? (
          <MaterialIcons name="chevron-right" size={18} color={koolaColors.faint} />
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      {interactive ? (
        <Pressable
          onPress={onPress}
          android_ripple={{ color: koolaColors.primarySoft }}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value || placeholder || 'chưa đặt'}`}>
          {({ pressed }) => inner(pressed)}
        </Pressable>
      ) : (
        inner(false)
      )}
      {!last ? <KoolaDivider style={styles.rowDivider} /> : null}
    </>
  );
};

export default EditProfileScreen;

const HERO_BAND_HEIGHT = 220;
const AVATAR_SIZE = 120;
const AVATAR_RING = 3;
const AVATAR_TOTAL = AVATAR_SIZE + AVATAR_RING * 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },

  // Header
  header: {
    backgroundColor: koolaColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  headerRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: koolaSpacing.sm,
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
  },

  // Scroll
  scroll: {
    paddingBottom: koolaSpacing.xxl,
  },

  // Hero
  heroWrap: {
    paddingHorizontal: koolaSpacing.lg,
    paddingTop: koolaSpacing.lg,
  },
  heroBandWrap: {
    borderTopLeftRadius: koolaRadii.lg,
    borderTopRightRadius: koolaRadii.lg,
    overflow: 'hidden',
  },
  heroBand: {
    height: HERO_BAND_HEIGHT,
    overflow: 'hidden',
  },
  heroBandPressed: {
    opacity: 0.86,
  },
  heroBandTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  heroBandImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroBandOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(37,99,235,0.06)',
  },
  heroBandPrompt: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBandPromptIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: koolaColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    ...koolaShadows.subtle,
  },
  heroBandPromptText: {
    letterSpacing: 0.2,
  },
  heroBandLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBandLoadingDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInfoCard: {
    marginTop: -koolaRadii.lg,
    borderTopLeftRadius: koolaRadii.lg,
    borderTopRightRadius: koolaRadii.lg,
    borderBottomLeftRadius: koolaRadii.lg,
    borderBottomRightRadius: koolaRadii.lg,
    paddingTop: AVATAR_TOTAL * 0.4 + koolaSpacing.md,
    paddingBottom: koolaSpacing.lg,
    paddingHorizontal: koolaSpacing.lg,
    alignItems: 'center',
  },
  avatarPressable: {
    position: 'absolute',
    top: -(AVATAR_TOTAL * 0.6),
    left: '50%',
    marginLeft: -(AVATAR_TOTAL / 2),
    width: AVATAR_TOTAL,
    height: AVATAR_TOTAL,
    zIndex: 10,
  },
  avatarRing: {
    padding: AVATAR_RING,
    borderRadius: AVATAR_TOTAL / 2,
    backgroundColor: koolaColors.surface,
    ...koolaShadows.soft,
  },
  avatarOverlay: {
    position: 'absolute',
    top: AVATAR_RING,
    left: AVATAR_RING,
    right: AVATAR_RING,
    bottom: AVATAR_RING,
    backgroundColor: 'rgba(16,24,40,0.45)',
    borderRadius: AVATAR_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: koolaColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: koolaColors.surface,
  },
  heroName: {
    marginTop: koolaSpacing.sm,
    textAlign: 'center',
  },
  heroUsername: {
    marginTop: 2,
    textAlign: 'center',
  },

  // Section
  sectionHeader: {
    paddingHorizontal: koolaSpacing.lg + 4,
    paddingTop: koolaSpacing.xl,
    paddingBottom: koolaSpacing.sm,
  },
  sectionLabel: {
    letterSpacing: 0.8,
  },
  sectionCard: {
    marginHorizontal: koolaSpacing.lg,
    borderRadius: koolaRadii.md,
    overflow: 'hidden',
  },

  // Row
  row: {
    minHeight: 60,
    paddingHorizontal: koolaSpacing.lg,
    paddingVertical: koolaSpacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowDivider: {
    marginLeft: koolaSpacing.lg + 24 + koolaSpacing.md,
  },
  rowPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  iconShell: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: koolaSpacing.md,
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowValue: {
    marginTop: koolaSpacing.xs,
  },
  rowSubValue: {
    marginTop: 4,
  },
  rowChevron: {
    marginLeft: koolaSpacing.sm,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifiedIcon: {
    marginRight: 4,
  },
});
