import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ConnectTabStackParamList } from '../../navigation/types';
import type { Business } from '../../types';
import { businessesApi, conversationsApi } from '../../services/api/apiService';
import BusinessCard from '../../components/connect/BusinessCard';
import EmptyConnect from '../../components/connect/EmptyConnect';
import { KoolaIconButton, KoolaState, koolaColors } from '../../ui';

type BusinessSearchNavProp = NativeStackNavigationProp<ConnectTabStackParamList>;

const BusinessSearchScreen: React.FC = () => {
  const navigation = useNavigation<BusinessSearchNavProp>();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await businessesApi.list({ q: query });
        setResults(res.items);
      } catch (err) {
        console.warn('Business search error:', err);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const updateResult = useCallback((id: string, updates: Partial<Business>) => {
    setResults((prev) =>
      prev.map((item) => (item._id === id ? { ...item, ...updates } : item)),
    );
  }, []);

  const navigateToChat = useCallback(
    (conversationId: string) => {
      (navigation as any).navigate('ChatTab', {
        screen: 'Chat',
        params: { conversationId },
      });
    },
    [navigation],
  );

  const handleConnectAndChat = useCallback(
    async (business: Business) => {
      setConnectingId(business._id);
      updateResult(business._id, { isConnected: true });
      try {
        await businessesApi.connect(business._id);
      } catch (err) {
        updateResult(business._id, { isConnected: false });
        console.warn('Connect failed:', err);
        setConnectingId(null);
        return;
      }
      try {
        const { conversation } = await conversationsApi.startDirectChat(business.ownerId);
        navigateToChat(conversation._id);
      } catch (err) {
        console.warn('Start direct chat failed after connect:', err);
      } finally {
        setConnectingId(null);
      }
    },
    [updateResult, navigateToChat],
  );

  const handleMessage = useCallback(
    async (business: Business) => {
      try {
        const { conversation } = await conversationsApi.startDirectChat(business.ownerId);
        navigateToChat(conversation._id);
      } catch (err) {
        console.warn('Start direct chat failed:', err);
      }
    },
    [navigateToChat],
  );

  const renderItem = useCallback(
    ({ item }: { item: Business }) => (
      <BusinessCard
        business={item}
        onPress={() =>
          navigation.navigate('BusinessProfile', {
            businessId: item._id,
          })
        }
        onConnectAndChatPress={() => handleConnectAndChat(item)}
        onMessagePress={() => handleMessage(item)}
        isConnecting={connectingId === item._id}
      />
    ),
    [navigation, handleConnectAndChat, handleMessage, connectingId],
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
      <View style={styles.header}>
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
          placeholderTextColor={koolaColors.faint}
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {loading && (
          <ActivityIndicator
            size="small"
            color={koolaColors.primary}
            style={styles.inputLoader}
          />
        )}
      </View>

      <FlatList
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: koolaColors.surface,
    paddingTop: (StatusBar.currentHeight || 0) + 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  input: {
    flex: 1,
    height: 42,
    backgroundColor: koolaColors.canvas,
    borderRadius: 20,
    paddingHorizontal: 16,
    fontSize: 14,
    color: koolaColors.ink,
  },
  inputLoader: {
    marginLeft: 4,
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
    gap: 12,
  },
});

export default BusinessSearchScreen;
