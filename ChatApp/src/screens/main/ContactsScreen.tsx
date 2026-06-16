import React, { useCallback } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { ContactsScreenNavigationProp } from '../../navigation/types';
import { conversationsApi } from '../../services/api/apiService';
import { useContactsSearch } from '../../hooks/useContactsSearch';
import ContactSearchBar from '../../components/ContactSearchBar';
import ContactItem from '../../components/ContactItem';
import type { UserSearchResult } from '../../types';

const ContactsScreen: React.FC = () => {
  const navigation = useNavigation<ContactsScreenNavigationProp>();
  const { results, isLoading, error, search, loadMore, hasMore } =
    useContactsSearch();

  const handleSearch = useCallback(
    (query: string) => {
      search(query);
    },
    [search],
  );

  const handleContactPress = useCallback(
    async (user: UserSearchResult) => {
      try {
        const { conversation } = await conversationsApi.startDirectChat(user._id);
        // Navigate to ChatsTab then to Chat screen
        const parent = navigation.getParent();
        parent?.navigate('ChatTab', {
          screen: 'Chat',
          params: { conversationId: conversation._id },
        } as never);
      } catch (err: unknown) {
        const error = err as { response?: { data?: { message?: string } } };
        Alert.alert('Error', error.response?.data?.message || 'Failed to start chat');
      }
    },
    [navigation],
  );

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => search('')}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (results.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyText}>Search for people by name or email</Text>
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ContactSearchBar onSearch={handleSearch} />

      <FlatList
        // Fabric workaround facebook/react-native#53258 — clipped subviews race on unmount
        removeClippedSubviews={false}
        data={results}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <ContactItem user={item} onPress={() => handleContactPress(item)} />
        )}
        ListEmptyComponent={renderEmpty}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  separator: { height: 1, backgroundColor: '#f0f0f0' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 120 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 16, color: '#999', textAlign: 'center' },
  errorText: { fontSize: 14, color: '#ff4444', marginBottom: 12, textAlign: 'center' },
  retryButton: {
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#2196F3', borderRadius: 8,
  },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

export default ContactsScreen;
