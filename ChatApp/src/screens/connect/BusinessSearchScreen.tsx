import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  TextInput,
  FlatList,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { ConnectTabStackParamList } from '../../navigation/types';
import type { BusinessAccountItem } from '../../services/api/apiService';
import { accountDiscoveryApi, conversationsApi } from '../../services/api/apiService';
import EmptyConnect from '../../components/connect/EmptyConnect';
import { CATEGORY_LABELS } from './constants';
import { KoolaIconButton, KoolaState, KoolaText, koolaColors, koolaRadii } from '../../ui';

type BusinessSearchNavProp = NativeStackNavigationProp<ConnectTabStackParamList>;

const BusinessSearchScreen: React.FC = () => {
  const navigation = useNavigation<BusinessSearchNavProp>();
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
    ({ item }: { item: BusinessAccountItem }) => {
      const categoryLabel =
        (item.businessCategory ? CATEGORY_LABELS[item.businessCategory] : undefined) ||
        item.businessCategory ||
        '';
      return (
        <Pressable
          style={styles.card}
          onPress={() =>
            navigation.navigate('BusinessProfile', { businessId: item._id })
          }
          accessibilityRole="button"
          accessibilityLabel={`Xem hồ sơ ${item.displayName}`}>
          <View style={styles.logo}>
            <MaterialIcons name="business" size={22} color={koolaColors.primary} />
          </View>
          <View style={styles.content}>
            <View style={styles.nameRow}>
              <KoolaText variant="label" weight="700" numberOfLines={1} style={styles.name}>
                {item.displayName}
              </KoolaText>
              {item.verificationStatus === 'verified' && (
                <MaterialIcons name="verified" size={14} color={koolaColors.success} />
              )}
            </View>
            <View style={styles.meta}>
              {categoryLabel ? (
                <KoolaText variant="caption" tone="primary" weight="700" numberOfLines={1}>
                  {categoryLabel}
                </KoolaText>
              ) : null}
              {item.province ? (
                <>
                  <View style={styles.dot} />
                  <MaterialIcons name="location-on" size={11} color={koolaColors.muted} />
                  <KoolaText variant="caption" tone="muted" numberOfLines={1}>
                    {item.province}
                  </KoolaText>
                </>
              ) : null}
            </View>
          </View>
          <Pressable
            style={styles.cta}
            onPress={(e) => {
              e.stopPropagation();
              handleMessage(item);
            }}
            disabled={messagingId === item._id}
            accessibilityRole="button"
            accessibilityLabel="Nhắn tin">
            {messagingId === item._id ? (
              <ActivityIndicator size="small" color={koolaColors.primary} />
            ) : (
              <>
                <MaterialIcons name="chat-bubble-outline" size={16} color={koolaColors.primary} />
                <KoolaText variant="caption" tone="primary" weight="700">Nhắn tin</KoolaText>
              </>
            )}
          </Pressable>
        </Pressable>
      );
    },
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: koolaColors.surface,
    padding: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: koolaRadii.md,
    backgroundColor: koolaColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    flex: 1,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: koolaColors.faint,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: koolaRadii.pill,
    backgroundColor: koolaColors.primarySoft,
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
