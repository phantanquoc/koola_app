import React, { useCallback, useEffect, useState } from 'react';
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
  koolaColors,
  koolaRadii,
  koolaShadows,
  koolaSpacing,
} from '../../ui';

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const route = useRoute<ProfileScreenRouteProp>();
  const { userId } = route.params;
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarBottomInset();

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
      Alert.alert(
        'Error',
        error.response?.data?.message || 'Failed to start chat',
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
          android_ripple={{ color: koolaColors.line, borderless: true, radius: 22 }}
          style={({ pressed }) => [styles.headerBack, pressed && styles.headerBackPressed]}
          accessibilityRole="button"
          accessibilityLabel="Quay lại">
          <MaterialIcons name="arrow-back" size={24} color={koolaColors.ink} />
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
            <KoolaSkeleton width={92} height={92} radius={46} />
            <KoolaSkeleton width="52%" height={22} />
            <KoolaSkeleton width="68%" height={14} />
            <KoolaSkeleton width="44%" height={32} radius={16} />
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
              <FakeGradientBand />
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
            <KoolaText variant="title" align="center" numberOfLines={2} style={styles.name}>
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
            <KoolaText variant="heading" weight="700">
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
          />
          <KoolaDivider />
          <InfoRow
            icon="schedule"
            label="Hoạt động"
            value={lastSeenText}
          />
          <KoolaDivider />
          <InfoRow
            icon="verified-user"
            label="Trạng thái"
            value={profileUser.isOnline ? 'Có thể nhắn ngay' : 'Sẽ nhận tin nhắn khi quay lại'}
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

interface InfoRowProps {
  icon: string;
  label: string;
  value: string;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value }) => (
  <View style={styles.infoRow}>
    <View style={styles.infoIcon}>
      <MaterialIcons name={icon} size={19} color={koolaColors.primary} />
    </View>
    <View style={styles.infoCopy}>
      <KoolaText variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </KoolaText>
      <KoolaText variant="label" numberOfLines={2}>
        {value}
      </KoolaText>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },
  scroll: {
    flex: 1,
  },
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
    gap: 14,
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
    backgroundColor: koolaColors.primarySoft,
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
    borderColor: koolaColors.line,
    ...koolaShadows.soft,
  },
  avatarFrame: {
    marginTop: -58,
    padding: 5,
    borderRadius: koolaRadii.pill,
    backgroundColor: koolaColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    ...koolaShadows.subtle,
  },
  identityBlock: {
    width: '100%',
    alignItems: 'center',
    marginTop: koolaSpacing.md,
    paddingHorizontal: koolaSpacing.lg,
  },
  name: {
    color: koolaColors.ink,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: koolaSpacing.sm,
    marginTop: koolaSpacing.md,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  online: {
    backgroundColor: koolaColors.success,
  },
  offline: {
    backgroundColor: koolaColors.faint,
  },
  bioBox: {
    marginTop: koolaSpacing.lg,
    marginHorizontal: koolaSpacing.xl,
    marginBottom: koolaSpacing.xl,
    paddingHorizontal: koolaSpacing.lg,
    paddingVertical: koolaSpacing.md,
    borderRadius: koolaRadii.md,
    backgroundColor: koolaColors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
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
    gap: koolaSpacing.xs,
  },
  infoRow: {
    minHeight: 74,
    paddingHorizontal: koolaSpacing.lg,
    paddingVertical: koolaSpacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: koolaSpacing.md,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: koolaRadii.md,
    backgroundColor: koolaColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCopy: {
    flex: 1,
    gap: koolaSpacing.xs,
  },
  actionPanel: {
    marginTop: koolaSpacing.lg,
    gap: koolaSpacing.md,
  },
  chatButton: {
    borderRadius: koolaRadii.md,
  },
});

export default ProfileScreen;
