import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { ProfileScreenNavigationProp, ProfileScreenRouteProp } from '../../navigation/types';
import { usersApi, conversationsApi } from '../../services/api/apiService';
import UserAvatar from '../../components/UserAvatar';
import type { User } from '../../types';
import { formatDistanceToNow } from 'date-fns';

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const route = useRoute<ProfileScreenRouteProp>();
  const { userId } = route.params;

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // For now, get presence - full profile fetch if available
        const presence = await usersApi.searchUsers(userId);
        // This is a workaround — ideally we'd have GET /users/:id
        if (presence.items.length > 0) {
          const u = presence.items[0];
          setProfileUser({
            _id: u._id,
            email: u.email,
            displayName: u.displayName,
            avatar: u.avatar || '',
            isOnline: u.isOnline,
            lastSeen: u.lastSeen,
            settings: { notificationsEnabled: true },
          });
        }
      } catch {
        // Ignore errors
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
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
      Alert.alert('Error', error.response?.data?.message || 'Failed to start chat');
    } finally {
      setChatLoading(false);
    }
  }, [userId, navigation]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!profileUser) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>User not found</Text>
      </SafeAreaView>
    );
  }

  const lastSeenText = profileUser.isOnline
    ? 'Online'
    : profileUser.lastSeen
      ? `Last seen ${formatDistanceToNow(new Date(profileUser.lastSeen), { addSuffix: true })}`
      : 'Offline';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.profileSection}>
        <UserAvatar
          displayName={profileUser.displayName}
          avatar={profileUser.avatar || undefined}
          size={80}
        />
        <Text style={styles.name}>{profileUser.displayName}</Text>
        <Text style={styles.email}>{profileUser.email}</Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              profileUser.isOnline ? styles.online : styles.offline,
            ]}
          />
          <Text style={styles.statusText}>{lastSeenText}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.chatButton, chatLoading && styles.chatButtonDisabled]}
        onPress={handleStartChat}
        disabled={chatLoading}>
        {chatLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.chatButtonText}>Start Chat</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  profileSection: { alignItems: 'center', paddingVertical: 32 },
  name: { fontSize: 24, fontWeight: 'bold', color: '#333', marginTop: 16 },
  email: { fontSize: 14, color: '#999', marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  online: { backgroundColor: '#4CAF50' },
  offline: { backgroundColor: '#ccc' },
  statusText: { fontSize: 14, color: '#666' },
  chatButton: {
    marginHorizontal: 24, height: 48, backgroundColor: '#2196F3', borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', marginTop: 24,
  },
  chatButtonDisabled: { opacity: 0.6 },
  chatButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  errorText: { fontSize: 16, color: '#999', textAlign: 'center', marginTop: 60 },
});

export default ProfileScreen;
