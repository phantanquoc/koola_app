import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  TextInput,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ConnectTabStackParamList } from '../../navigation/types';
import type { BusinessAccountItem } from '../../services/api/apiService';
import { accountDiscoveryApi, conversationsApi } from '../../services/api/apiService';
import EmptyConnect from '../../components/connect/EmptyConnect';
import BusinessCard from '../../components/connect/BusinessCard';
import { KoolaIconButton, KoolaState, KoolaText, useKoolaToast, useTheme } from '../../ui';
import type { Palette } from '../../ui/theme';

type BusinessSearchNavProp = NativeStackNavigationProp<ConnectTabStackParamList>;

const BusinessSearchScreen: React.FC = () => {
  const navigation = useNavigation<BusinessSearchNavProp>();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const toast = useKoolaToast();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BusinessAccountItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [messagingId, setMessagingId] = useState<string | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await accountDiscoveryApi.list({ q: query });
        setResults(res.items);
      } catch (err) {
        console.warn('Business account search error:', err);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const navigateToChat = useCallback(
    (conversationId: string) => {
      (navigation as any).navigate('ChatTab', {
        screen: 'Chat',
        params: { conversationId },
      });
    },
    [navigation],
  );

  const handleMessage = useCallback(
    async (account: BusinessAccountItem) => {
      setMessagingId(account._id);
      try {
        const { conversation } = await conversationsApi.startDirectChat(account._id);
        navigateToChat(conversation._id);
      } catch (err) {
        if (__DEV__) console.warn('Start direct chat failed:', err);
        toast.show('Không thể bắt đầu trò chuyện. Bạn thử lại nhé.', 'danger');
      } finally {
        setMessagingId(null);
      }
    },
    [navigateToChat, toast],
  );

  const renderItem = useCallback(
    ({ item }: { item: BusinessAccountItem }) => (
      <BusinessCard
        item={item}
        onPress={() =>
          navigation.navigate('BusinessProfile', { businessId: item._id })
        }
        onMessagePress={() => handleMessage(item)}
        messageDisabled={messagingId === item._id}
        messageLoading={messagingId === item._id}
      />
    ),
    [navigation, handleMessage, messagingId],
  );

  const renderEmpty = () => {
    if (loading) return null;
    if (query.length < 2) {
      return (
        <View style={styles.promptContainer}>
          <KoolaState
            icon="search"
            title="Tìm doanh nghiệp"
            message="Nhập ít nhất 2 ký tự để tìm kiếm doanh nghiệp phù hợp."
          />
        </View>
      );
    }
    return <EmptyConnect />;
  };

  return (
    <View style={styles.container}>
      {/* Search bar header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <KoolaIconButton
          icon="arrow-back"
          tone="muted"
          size={38}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Quay lại"
        />
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Tìm doanh nghiệp..."
          placeholderTextColor={palette.faint}
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {loading && (
          <ActivityIndicator
            size="small"
            color={palette.primary}
            style={styles.inputLoader}
          />
        )}
      </View>

      <FlatList
        removeClippedSubviews={false}
        data={results}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
};

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.canvas,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: p.surface,
      // paddingTop comes from useSafeAreaInsets() at the call site. StatusBar
      // .currentHeight reads ROOT window insets, so it stays non-zero even
      // though <StatusBar translucent={false}> already offsets the RN view
      // below the bar — that double-counted and pushed the header down.
      paddingHorizontal: 12,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.line,
    },
    input: {
      flex: 1,
      height: 42,
      backgroundColor: p.canvas,
      borderRadius: 20,
      paddingHorizontal: 16,
      fontSize: 14,
      color: p.ink,
      marginLeft: 8,
    },
    inputLoader: {
      marginLeft: 8,
    },
    listContent: {
      paddingTop: 8,
      paddingBottom: 16,
      flexGrow: 1,
    },
    promptContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 80,
      paddingHorizontal: 32,
    },
  });

export default BusinessSearchScreen;
