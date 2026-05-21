import React, { useCallback, useEffect, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { formatDistanceToNow } from 'date-fns';
import type {
  ProfileScreenNavigationProp,
  ProfileScreenRouteProp,
} from '../../navigation/types';
import { conversationsApi, usersApi } from '../../services/api/apiService';
import UserAvatar from '../../components/UserAvatar';
import type { User } from '../../types';
import {
  KoolaBadge,
  KoolaButton,
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

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);

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
        <KoolaSurface variant="raised" style={styles.loadingCard}>
          <KoolaSkeleton width={80} height={80} radius={40} />
          <KoolaSkeleton width="55%" height={20} />
          <KoolaSkeleton width="72%" height={14} />
          <KoolaSkeleton width="42%" height={34} radius={17} />
        </KoolaSurface>
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
    ? 'Online'
    : profileUser.lastSeen
      ? `Last seen ${formatDistanceToNow(new Date(profileUser.lastSeen), {
          addSuffix: true,
        })}`
      : 'Offline';

  return (
    <SafeAreaView style={styles.container}>
      <KoolaSurface variant="raised" style={styles.profileCard}>
        <UserAvatar
          displayName={profileUser.displayName}
          avatar={profileUser.avatar || undefined}
          size={88}
        />
        <KoolaText variant="title" align="center" numberOfLines={2} style={styles.name}>
          {profileUser.displayName}
        </KoolaText>
        <KoolaText variant="body" tone="muted" align="center" numberOfLines={1}>
          {profileUser.email}
        </KoolaText>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              profileUser.isOnline ? styles.online : styles.offline,
            ]}
          />
          <KoolaBadge
            label={lastSeenText}
            tone={profileUser.isOnline ? 'success' : 'muted'}
          />
        </View>
      </KoolaSurface>

      <KoolaButton
        title="Bắt đầu trò chuyện"
        icon="chat-bubble-outline"
        loading={chatLoading}
        disabled={chatLoading}
        onPress={handleStartChat}
        style={styles.chatButton}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
    padding: 20,
  },
  loadingCard: {
    alignItems: 'center',
    paddingVertical: 34,
    gap: 14,
    marginTop: 20,
  },
  profileCard: {
    alignItems: 'center',
    paddingVertical: 34,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  name: {
    marginTop: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
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
  chatButton: {
    marginTop: 18,
  },
});

export default ProfileScreen;
