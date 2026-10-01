import React, { useCallback, useMemo } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { ContactsScreenNavigationProp } from '../../navigation/types';
import { conversationsApi } from '../../services/api/apiService';
import { useContactsSearch } from '../../hooks/useContactsSearch';
import ContactSearchBar from '../../components/ContactSearchBar';
import ContactItem from '../../components/ContactItem';
import { KoolaEmptyState, KoolaErrorState, useTheme } from '../../ui';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { ChatHomeHeaderInsetContext } from './ChatHomeHeaderInsetContext';
import { CHAT_CHROME_LIFT_DISTANCE, ChatSubTabVisibilityContext } from './ChatSubTabVisibilityContext';
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import type { UserSearchResult } from '../../types';

const ContactsScreen: React.FC = () => {
  const navigation = useNavigation<ContactsScreenNavigationProp>();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const tabBarInset = useTabBarBottomInset();
  const headerInset = React.useContext(ChatHomeHeaderInsetContext);
  const visibilityContext = React.useContext(ChatSubTabVisibilityContext);
  // Chỉ báo độ cuộn cho bóng đổ của glass chrome (Contacts không ẩn sub-tab bar).
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      if (!visibilityContext) return;
      const lift = Math.max(0, event.contentOffset.y) / CHAT_CHROME_LIFT_DISTANCE;
      visibilityContext.scrolledProgress.value = lift > 1 ? 1 : lift;
    },
  });
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
        const parent = navigation.getParent();
        parent?.navigate('ChatTab', {
          screen: 'Chat',
          params: { conversationId: conversation._id },
        } as never);
      } catch (err: unknown) {
        const error = err as { response?: { data?: { message?: string } } };
        Alert.alert('Lỗi', error.response?.data?.message || 'Không thể bắt đầu cuộc trò chuyện');
      }
    },
    [navigation],
  );

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={tokens.semantic.action.primary} />
        </View>
      );
    }

    if (error) {
      return (
        <KoolaErrorState
          message={error}
          onRetry={() => search('')}
          style={styles.emptyContainer}
        />
      );
    }

    if (results.length === 0) {
      return (
        <KoolaEmptyState
          icon="people"
          title="Tìm người trên Koola"
          message="Tìm kiếm người dùng Koola theo tên hoặc email"
          style={styles.emptyContainer}
        />
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Animated.FlatList
        onScroll={handleScroll}
        scrollEventThrottle={16}
        // The list starts at y=0 behind Chat Home's glass header + overlaid
        // sub-tab bar; the search bar rides in the list header so it sits just
        // below the resting chrome instead of being hidden under it.
        ListHeaderComponent={<ContactSearchBar onSearch={handleSearch} />}
        keyboardShouldPersistTaps="handled"
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
        contentContainerStyle={{ paddingTop: headerInset, paddingBottom: tabBarInset }}
      />
    </SafeAreaView>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: semantic.bg.canvas },
    separator: { height: 1, backgroundColor: semantic.border.subtle },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 120 },
  });

export default ContactsScreen;
