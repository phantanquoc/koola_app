import React, { useCallback } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ListRenderItem,
} from 'react-native';
import type { NavigationProp } from '@react-navigation/native';
import { ContactSearchBar } from '../../components/ContactSearchBar';
import { ContactItem } from '../../components/ContactItem';
import { conversationsApi } from '../../services/api/apiService';
import { useContactsSearch } from '../../hooks/useContactsSearch';
import type { ContactsScreenProps } from '../../navigation/types';
import type { RootStackParamList, MainTabParamList } from '../../navigation/types';

type RootNavProp = NavigationProp<RootStackParamList>;

export const ContactsScreen: React.FC<ContactsScreenProps> = ({ navigation }) => {
  const { results, isLoading, error, hasMore, search, loadMore, clear } = useContactsSearch();
  const rootNav = navigation.getParent<NavigationProp<RootStackParamList>>();

  const handleContactPress = useCallback(
    async (userId: string, userData: any) => {
      try {
        const res = await conversationsApi.startDirectChat(userId);
        const conv = (res.data as any).conversation;
        if (conv?._id) {
          if (rootNav) {
            rootNav.navigate('MainGroup', {
              screen: 'ChatsTab',
              params: { screen: 'Chat', params: { conversationId: conv._id } },
            } as any);
          } else {
            (navigation as any).navigate('Chat', { conversationId: conv._id });
          }
        }
      } catch {
        // silently ignore
      }
    },
    [navigation, rootNav],
  );

  const handleContactLongPress = useCallback(
    (userId: string, userData: any) => {
      navigation.navigate('Profile', userData);
    },
    [navigation],
  );

  const renderItem: ListRenderItem<any> = useCallback(
    ({ item }) => (
      <ContactItem
        userId={item._id}
        displayName={item.displayName}
        email={item.email}
        avatar={item.avatar}
        isOnline={item.isOnline}
        onPress={(id) => handleContactPress(id, item)}
        onLongPress={(id) => handleContactLongPress(id, item)}
      />
    ),
    [handleContactPress, handleContactLongPress],
  );

  const renderFooter = useCallback(() => {
    if (!isLoading || results.length === 0) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  }, [isLoading, results.length]);

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    if (error) {
      return (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => search('')}>
            <Text style={styles.retryText}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    // Default empty state
    return (
      <View style={styles.centerState}>
        <Text style={styles.emptyText}>Search for people by name or email</Text>
      </View>
    );
  }, [isLoading, error, search]);

  const keyExtractor = useCallback((item: any) => item._id, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Contacts</Text>
      </View>

      <ContactSearchBar onSearch={search} />

      <FlatList
        data={results}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        contentContainerStyle={results.length === 0 ? styles.emptyList : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#1a1a1a' },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 8,
  },
  retryText: {
    fontSize: 14,
    color: '#007AFF',
  },
  emptyList: { flexGrow: 1 },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
