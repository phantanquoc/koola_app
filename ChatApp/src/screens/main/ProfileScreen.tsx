import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { UserAvatar } from '../../components/UserAvatar';
import { conversationsApi } from '../../services/api/apiService';
import type { ProfileScreenProps } from '../../navigation/types';
import type { RootStackParamList } from '../../navigation/types';

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ route, navigation }) => {
  const { userId } = route.params;

  // User data is passed via navigation params from ContactsScreen
  const params = route.params as any;
  const displayName = params?.displayName ?? 'User';
  const email = params?.email ?? '';
  const avatar = params?.avatar;
  const isOnline = params?.isOnline ?? false;
  const lastSeen = params?.lastSeen;

  const lastSeenText = lastSeen
    ? formatDistanceToNow(new Date(lastSeen), { addSuffix: true })
    : null;

  const statusText = isOnline ? 'Online' : lastSeenText ?? 'Offline';

  const handleStartChat = useCallback(async () => {
    try {
      const res = await conversationsApi.startDirectChat(userId);
      const conv = (res.data as any).conversation;
      if (conv?._id) {
        // Navigate via parent (MainTab → ChatsStack → Chat)
        const parentNav = navigation.getParent();
        (parentNav as any).navigate('ChatsTab', {
          screen: 'Chat',
          params: { conversationId: conv._id },
        });
      }
    } catch {
      // ignore
    }
  }, [userId, navigation]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatarSection}>
        <UserAvatar displayName={displayName} avatar={avatar} size={96} />
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.displayName}>{displayName}</Text>
        <Text style={styles.email}>{email}</Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isOnline
                  ? 'rgb(76, 175, 80)'
                  : 'rgb(189, 189, 189)',
              },
            ]}
          />
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.startChatBtn}
        onPress={handleStartChat}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Start Chat"
      >
        <Text style={styles.startChatBtnText}>Start Chat</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  avatarSection: {
    marginBottom: 20,
  },
  infoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 4,
  },
  email: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
    color: '#888',
  },
  startChatBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  startChatBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
