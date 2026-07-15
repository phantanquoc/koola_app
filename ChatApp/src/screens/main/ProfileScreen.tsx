import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { getOrDownload } from '../../services/media/mediaCacheService';
import { useNavigation, useRoute } from '@react-navigation/native';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  ProfileScreenNavigationProp,
  ProfileScreenRouteProp,
} from '../../navigation/types';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { conversationsApi, usersApi } from '../../services/api/apiService';
import UserAvatar from '../../components/UserAvatar';
import type { User } from '../../types';
import {
  KoolaBadge,
  KoolaButton,
  KoolaDivider,
  KoolaState,
  KoolaSurface,
  KoolaText,
  KoolaSkeleton,
  koolaRadii,
  koolaShadows,
  koolaSpacing,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const route = useRoute<ProfileScreenRouteProp>();
  const { userId } = route.params;
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarBottomInset();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [coverUri, setCoverUri] = useState<string | null>(null);

  // Resolve cover photo media key to a local URI for display
  useEffect(() => {
    if (profileUser?.coverPhoto) {
      getOrDownload(profileUser.coverPhoto)
        .then(setCoverUri)
        .catch(() => setCoverUri(null));
    } else {
      setCoverUri(null);
    }
  }, [profileUser?.coverPhoto]);

  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      try {
        const u = await usersApi.getUserById(userId);
        if (cancelled) return;
        if (u) {
          setProfileUser({
            _id: u._id,
            email: u.email,
            displayName: u.displayName,
            avatar: u.avatar || '',
            username: u.username,
            bio: u.bio,
            isOnline: u.isOnline,
            lastSeen: u.lastSeen,
            settings: u.settings || { notificationsEnabled: true },
            coverPhoto: u.coverPhoto || undefined,
          });
        }
      } catch {
        // Empty state handles this below.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleStartChat = useCallback(async () => {
    setChatLoading(true);
    try {
      const { conversation } = await conversationsApi.startDirectChat(userId);
      const parent = navigation.getParent();
      parent?.navigate('ChatTab', {
        screen: 'Chat',
        params: { conversationId: conversation._id },
      } as never);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      if (__DEV__) console.warn('Start chat failed:', error.response?.data?.message);
      Alert.alert(
        'Không thể bắt đầu trò chuyện',
        'Đã xảy ra lỗi khi tạo cuộc trò chuyện. Bạn thử lại nhé.',
      );
    } finally {
      setChatLoading(false);
    }
  }, [userId, navigation]);

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={navigation.goBack}
          hitSlop={12}
          android_ripple={{ color: palette.line, borderless: true, radius: 22 }}
          style={({ pressed }) => [styles.headerBack, pressed && styles.headerBackPressed]}
          accessibilityRole="button"
          accessibilityLabel="Quay lại">
          <MaterialIcons name="arrow-back" size={24} color={palette.ink} />
        </Pressable>
        <KoolaText variant="heading" weight="700" style={styles.headerTitle} numberOfLines={1}>
          Hồ sơ
        </KoolaText>
        <View style={styles.headerSpacer} />
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingWrap}>
          <KoolaSurface variant="raised" style={styles.loadingCard}>
            <KoolaSkeleton width={92} height={92} radius={46} style={styles.loadingItem} />
            <KoolaSkeleton width="52%" height={22} style={styles.loadingItem} />
            <KoolaSkeleton width="68%" height={14} style={styles.loadingItem} />
            <KoolaSkeleton width="44%" height={32} radius={16} style={styles.loadingItem} />
            <KoolaSkeleton width="100%" height={84} radius={14} />
          </KoolaSurface>
        </View>
      </View>
    );
  }

  if (!profileUser) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.stateWrap}>
          <KoolaState
            icon="person-off"
            title="Không tìm thấy người dùng"
            message="Hồ sơ này không tồn tại hoặc bạn không có quyền xem."
          />
        </View>
      </View>
    );
  }

  const lastSeenText = profileUser.isOnline
    ? 'Đang hoạt động'
    : profileUser.lastSeen
      ? `Hoạt động ${formatDistanceToNow(new Date(profileUser.lastSeen), {
          addSuffix: true,
          locale: vi,
        })}`
      : 'Đang ngoại tuyến';

  return (
    <View style={styles.container}>
      {renderHeader()}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarInset + 18 },
        ]}
        showsVerticalScrollIndicator={false}>
        <KoolaSurface variant="raised" style={styles.profileCard}>
          <View style={styles.coverFrame}>
            {coverUri ? (
              <Image
                source={{ uri: coverUri }}
                style={styles.coverImage}
                resizeMode="cover"
              />
            ) : (
              <FakeGradientBand palette={palette} />
            )}
            <View style={styles.coverScrim} />
          </View>

          <View style={styles.avatarFrame}>
            <UserAvatar
              displayName={profileUser.displayName}
              avatar={profileUser.avatar || undefined}
              size={112}
            />
          </View>

          <View style={styles.identityBlock}>
            <KoolaText variant="title" align="center" numberOfLines={2}>
              {profileUser.displayName}
            </KoolaText>
            {profileUser.username ? (
              <KoolaText variant="label" tone="primary" align="center" numberOfLines={1}>
                @{profileUser.username}
              </KoolaText>
            ) : null}
          </View>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                profileUser.isOnline ? styles.online : styles.offline,
              ]}
            />
            <KoolaBadge
              label={profileUser.isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
              tone={profileUser.isOnline ? 'success' : 'muted'}
            />
          </View>

          {profileUser.bio ? (
            <View style={styles.bioBox}>
              <KoolaText variant="body" tone="muted" align="center" numberOfLines={3}>
                {profileUser.bio}
              </KoolaText>
            </View>
          ) : null}
        </KoolaSurface>

        <KoolaSurface variant="outline" style={styles.infoCard}>
          <View style={styles.sectionIntro}>
            <KoolaText variant="heading" weight="700" style={{ marginBottom: koolaSpacing.xs }}>
              Thông tin hồ sơ
            </KoolaText>
            <KoolaText variant="caption" tone="muted">
              Những thông tin giúp bạn nhận diện và liên hệ đúng người.
            </KoolaText>
          </View>
          <InfoRow
            icon="alternate-email"
            label="Email"
            value={profileUser.email}
            palette={palette}
          />
          <KoolaDivider />
          <InfoRow
            icon="schedule"
            label="Hoạt động"
            value={lastSeenText}
            palette={palette}
          />
          <KoolaDivider />
          <InfoRow
            icon="verified-user"
            label="Trạng thái"
            value={profileUser.isOnline ? 'Có thể nhắn ngay' : 'Sẽ nhận tin nhắn khi quay lại'}
            palette={palette}
          />
        </KoolaSurface>

        <View style={styles.actionPanel}>
          <KoolaButton
            title="Bắt đầu trò chuyện"
            icon="chat-bubble-outline"
            size="lg"
            loading={chatLoading}
            disabled={chatLoading}
            onPress={handleStartChat}
            style={styles.chatButton}
          />
        </View>
      </ScrollView>
    </View>
  );
};

// ─── FakeGradientBand ───
// Stacked translucent bands faking a primarySoft→surface fade.
// In dark mode, bands blend toward the dark surface instead of white.
// No gradient lib available — 1px overlap prevents seams (ui-dna.md:70).
interface FakeGradientBandProps {
  palette: Palette;
}

const FakeGradientBand: React.FC<FakeGradientBandProps> = ({ palette }) => {
  const bandStyles = useMemo(() => makeGradBandStyles(palette), [palette]);
  return (
    <>
      <View style={StyleSheet.absoluteFillObject as object} />
      <View style={bandStyles.band1} />
      <View style={bandStyles.band2} />
      <View style={bandStyles.band3} />
      <View style={bandStyles.band4} />
      <View style={bandStyles.band5} />
    </>
  );
};

const makeGradBandStyles = (p: Palette) => {
  // Use surface color for the fade target — works in both light and dark
  const fadeTarget = p.surface;
  return StyleSheet.create({
    band1: { ...StyleSheet.absoluteFillObject, backgroundColor: p.primarySoft },
    band2: { position: 'absolute', left: 0, right: 0, top: '25%', bottom: -1, backgroundColor: fadeTarget, opacity: 0.25 },
    band3: { position: 'absolute', left: 0, right: 0, top: '50%', bottom: -1, backgroundColor: fadeTarget, opacity: 0.5 },
    band4: { position: 'absolute', left: 0, right: 0, top: '70%', bottom: -1, backgroundColor: fadeTarget, opacity: 0.7 },
    band5: { position: 'absolute', left: 0, right: 0, top: '85%', bottom: 0, backgroundColor: fadeTarget, opacity: 0.85 },
  });
};

interface InfoRowProps {
  icon: string;
  label: string;
  value: string;
  palette: Palette;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value, palette }) => (
  <View style={infoRowStyles.infoRow}>
    <View style={[infoRowStyles.infoIcon, { backgroundColor: palette.primarySoft }]}>
      <MaterialIcons name={icon} size={19} color={palette.primary} />
    </View>
    <View style={infoRowStyles.infoCopy}>
      <KoolaText variant="caption" tone="muted" numberOfLines={1} style={infoRowStyles.infoLabel}>
        {label}
      </KoolaText>
      <KoolaText variant="label" numberOfLines={2}>
        {value}
      </KoolaText>
    </View>
  </View>
);

const infoRowStyles = StyleSheet.create({
  infoRow: {
    minHeight: 74,
    paddingHorizontal: koolaSpacing.lg,
    paddingVertical: koolaSpacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: koolaRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: koolaSpacing.md,
  },
  infoCopy: {
    flex: 1,
  },
  infoLabel: {
    marginBottom: koolaSpacing.xs,
  },
});

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.canvas,
    },
    scroll: {
      flex: 1,
    },
    header: {
      backgroundColor: p.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.line,
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
    headerBackPressed: {
      opacity: 0.78,
      transform: [{ scale: 0.98 }],
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
    },
    headerSpacer: {
      width: 44,
    },
    content: {
      paddingHorizontal: koolaSpacing.lg,
      paddingTop: koolaSpacing.lg,
    },
    loadingWrap: {
      flex: 1,
      padding: 16,
      justifyContent: 'center',
    },
    loadingCard: {
      alignItems: 'center',
      paddingVertical: 28,
      paddingHorizontal: 18,
    },
    loadingItem: {
      marginBottom: 14,
    },
    stateWrap: {
      flex: 1,
      justifyContent: 'center',
    },
    coverFrame: {
      width: '100%',
      height: 164,
      overflow: 'hidden',
      borderTopLeftRadius: koolaRadii.lg,
      borderTopRightRadius: koolaRadii.lg,
      backgroundColor: p.primarySoft,
    },
    coverImage: {
      ...StyleSheet.absoluteFillObject,
    },
    coverScrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(16,24,40,0.08)',
    },
    profileCard: {
      alignItems: 'center',
      overflow: 'hidden',
      borderRadius: koolaRadii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      ...koolaShadows.md,
    },
    avatarFrame: {
      marginTop: -58,
      padding: 5,
      borderRadius: koolaRadii.pill,
      backgroundColor: p.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      ...koolaShadows.sm,
    },
    identityBlock: {
      width: '100%',
      alignItems: 'center',
      marginTop: koolaSpacing.md,
      paddingHorizontal: koolaSpacing.lg,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: koolaSpacing.md,
    },
    statusDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      marginRight: koolaSpacing.sm,
    },
    online: {
      backgroundColor: p.success,
    },
    offline: {
      backgroundColor: p.faint,
    },
    bioBox: {
      marginTop: koolaSpacing.lg,
      marginHorizontal: koolaSpacing.xl,
      marginBottom: koolaSpacing.xl,
      paddingHorizontal: koolaSpacing.lg,
      paddingVertical: koolaSpacing.md,
      borderRadius: koolaRadii.md,
      backgroundColor: p.canvas,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
    },
    infoCard: {
      marginTop: koolaSpacing.lg,
      overflow: 'hidden',
      borderRadius: koolaRadii.lg,
    },
    sectionIntro: {
      paddingHorizontal: koolaSpacing.lg,
      paddingTop: koolaSpacing.lg,
      paddingBottom: koolaSpacing.md,
    },
    actionPanel: {
      marginTop: koolaSpacing.lg,
    },
    chatButton: {
      borderRadius: koolaRadii.md,
    },
  });

export default ProfileScreen;
