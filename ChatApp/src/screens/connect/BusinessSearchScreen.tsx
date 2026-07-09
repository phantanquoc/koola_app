import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import type { BusinessAccountItem } from '../../services/api/apiService';
import { accountDiscoveryApi, conversationsApi } from '../../services/api/apiService';
import EmptyConnect from '../../components/connect/EmptyConnect';
import BusinessCard from '../../components/connect/BusinessCard';
import { KoolaIconButton, KoolaState, KoolaText, useTheme } from '../../ui';
import type { Palette } from '../../ui/theme';

type BusinessSearchNavProp = NativeStackNavigationProp<ConnectTabStackParamList>;

const BusinessSearchScreen: React.FC = () => {
  const navigation = useNavigation<BusinessSearchNavProp>();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const inputRef = useRef<TextInput>(null);

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
        console.warn('Start direct chat failed:', err);
      } finally {
        setMessagingId(null);
      }
    },
    [navigateToChat],
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
      paddingTop: (StatusBar.currentHeight || 0) + 8,
      paddingHorizontal: 12,
      paddingBottom: 12,
      gap: 8,
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
