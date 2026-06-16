import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { getOrDownload } from '../../services/media/mediaCacheService';
import { useNavigation, useRoute } from '@react-navigation/native';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
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
} from '../../ui';

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const route = useRoute<ProfileScreenRouteProp>();
  const { userId } = route.params;
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <KoolaSurface variant="raised" style={styles.loadingCard}>
            <KoolaSkeleton width={92} height={92} radius={46} />
            <KoolaSkeleton width="52%" height={22} />
            <KoolaSkeleton width="68%" height={14} />
            <KoolaSkeleton width="44%" height={32} radius={16} />
            <KoolaSkeleton width="100%" height={84} radius={14} />
          </KoolaSurface>
        </View>
      </SafeAreaView>
    );
  }

  if (!profileUser) {
    return (
      <SafeAreaView style={styles.container}>
        <KoolaState
          icon="person-off"
          title="Không tìm thấy người dùng"
          message="Hồ sơ này không tồn tại hoặc bạn không có quyền xem."
        />
      </SafeAreaView>
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
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarInset + 18 },
        ]}
        showsVerticalScrollIndicator={false}>
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
        </View>

        <KoolaSurface variant="raised" style={styles.profileCard}>
          <View style={styles.avatarFrame}>
            <UserAvatar
              displayName={profileUser.displayName}
              avatar={profileUser.avatar || undefined}
              size={104}
            />
          </View>

          <View style={styles.identityBlock}>
            <KoolaText variant="title" align="center" numberOfLines={2} style={styles.name}>
              {profileUser.displayName}
            </KoolaText>
            <KoolaText variant="body" tone="muted" align="center" numberOfLines={1}>
              {profileUser.email}
            </KoolaText>
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
        </KoolaSurface>

        <KoolaSurface variant="outline" style={styles.infoCard}>
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
    </SafeAreaView>
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
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  loadingWrap: {
    padding: 16,
  },
  loadingCard: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 18,
    gap: 14,
  },
  heroBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 156,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  heroBandImage: {
    ...StyleSheet.absoluteFillObject,
  },
  profileCard: {
    alignItems: 'center',
    paddingTop: 26,
    paddingBottom: 24,
    paddingHorizontal: 20,
    marginTop: 28,
  },
  avatarFrame: {
    padding: 4,
    borderRadius: 999,
    backgroundColor: koolaColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
  },
  identityBlock: {
    width: '100%',
    alignItems: 'center',
    marginTop: 14,
  },
  name: {
    color: koolaColors.ink,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
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
  infoCard: {
    marginTop: 14,
    overflow: 'hidden',
  },
  infoRow: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: koolaColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCopy: {
    flex: 1,
    gap: 2,
  },
  actionPanel: {
    marginTop: 14,
    gap: 10,
  },
  chatButton: {
    borderRadius: 14,
  },
});

export default ProfileScreen;
