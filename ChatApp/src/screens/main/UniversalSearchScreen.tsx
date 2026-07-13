import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { ChatTabStackParamList } from '../../navigation/types';
import type { Conversation, RecentSearchItem } from '../../types';
import { conversationsApi } from '../../services/api/apiService';
import { useUniversalSearch } from '../../hooks/useUniversalSearch';
import ConversationResultItem from '../../components/search/ConversationResultItem';
import ContactResultItem from '../../components/search/ContactResultItem';
import MessageResultItem from '../../components/search/MessageResultItem';
import { useAuth } from '../../contexts/AuthContext';
import { asyncStorage } from '../../services/storage/asyncStorage';
import { KoolaText, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';

const COLLAPSED_MAX = 3;
const EXPANDED_MAX = 20;

function resolveConversationHeader(
  conv: Conversation,
  currentUserId?: string,
): { displayName: string; avatar?: string } {
  if (conv.type === 'group') {
    return {
      displayName: conv.name || 'Nhóm',
      avatar: conv.avatar || undefined,
    };
  }
  const other = conv.members.find((m) => m.userId !== currentUserId);
  return {
    displayName: other?.user?.displayName || 'Người dùng',
    avatar: other?.user?.avatar || undefined,
  };
}

const UniversalSearchScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabStackParamList>>();
  const { user } = useAuth();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [expandedConversations, setExpandedConversations] = useState(false);
  const [expandedContacts, setExpandedContacts] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);

  useEffect(() => {
    conversationsApi.list(1, 50).then((res) => {
      setConversations(res.conversations);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    asyncStorage.getRecentSearches().then(setRecentSearches).catch(() => {});
  }, []);

  const { conversations: convResults, contacts, messages, loadingContacts, loadingMessages } =
    useUniversalSearch(query, conversations);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleClear = useCallback(() => {
    setQuery('');
  }, []);

  const saveSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    const updated = await asyncStorage.addRecentSearch(trimmed);
    setRecentSearches(updated);
  }, []);

  const handleConversationPress = useCallback(
    (conv: Conversation) => {
      void saveSearch(query);
      navigation.navigate('Chat', { conversationId: conv._id });
    },
    [navigation, query, saveSearch],
  );

  const handleContactPress = useCallback(
    (userId: string) => {
      void saveSearch(query);
      navigation.navigate('Profile', { userId });
    },
    [navigation, query, saveSearch],
  );

  const handleMessagePress = useCallback(
    (conversationId: string) => {
      void saveSearch(query);
      navigation.navigate('Chat', { conversationId });
    },
    [navigation, query, saveSearch],
  );

  const handleRecentPress = useCallback((term: string) => {
    setQuery(term);
  }, []);

  const handleRemoveRecent = useCallback(async (term: string) => {
    const updated = await asyncStorage.removeRecentSearch(term);
    setRecentSearches(updated);
  }, []);

  const handleClearAllRecent = useCallback(async () => {
    await asyncStorage.clearRecentSearches();
    setRecentSearches([]);
  }, []);

  const isQueryShort = query.length < 2;

  const visibleConvs = expandedConversations
    ? convResults.slice(0, EXPANDED_MAX)
    : convResults.slice(0, COLLAPSED_MAX);
  const visibleContacts = expandedContacts
    ? contacts.slice(0, EXPANDED_MAX)
    : contacts.slice(0, COLLAPSED_MAX);
  const visibleMessages = expandedMessages
    ? messages.slice(0, EXPANDED_MAX)
    : messages.slice(0, COLLAPSED_MAX);

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable
          style={styles.backButton}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Quay lại">
          <MaterialIcons name="arrow-back" size={24} color={tokens.semantic.text.primary} />
        </Pressable>

        <View style={styles.inputWrapper}>
          <MaterialIcons name="search" size={20} color={tokens.semantic.text.faint} style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Tìm kiếm"
            placeholderTextColor={tokens.semantic.text.faint}
            underlineColorAndroid="transparent"
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Tìm kiếm"
          />
          {query.length > 0 && (
            <Pressable
              onPress={handleClear}
              accessibilityRole="button"
              accessibilityLabel="Xóa từ khóa">
              <MaterialIcons name="close" size={20} color={tokens.semantic.text.faint} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}>

        {/* Empty state / Recent searches */}
        {isQueryShort && (
          recentSearches.length > 0 ? (
            <View>
              <View style={styles.recentHeader}>
                <KoolaText weight="600" style={styles.recentTitle}>Tìm kiếm gần đây</KoolaText>
                <Pressable
                  onPress={handleClearAllRecent}
                  accessibilityRole="button"
                  accessibilityLabel="Xóa tất cả lịch sử tìm kiếm">
                  <KoolaText tone="primary" weight="500" variant="caption">Xóa tất cả</KoolaText>
                </Pressable>
              </View>
              {recentSearches.map((item) => {
                const term = item.query;
                return (
                <View key={term} style={styles.recentItem}>
                  <Pressable
                    style={styles.recentItemContent}
                    onPress={() => handleRecentPress(term)}
                    accessibilityRole="button"
                    accessibilityLabel={`Tìm kiếm ${term}`}>
                    <MaterialIcons name="history" size={20} color={tokens.semantic.text.faint} />
                    <KoolaText numberOfLines={1} style={styles.recentItemText}>{term}</KoolaText>
                  </Pressable>
                  <Pressable
                    onPress={() => handleRemoveRecent(term)}
                    style={styles.recentRemoveButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa ${term} khỏi lịch sử`}>
                    <MaterialIcons name="close" size={18} color={tokens.semantic.text.faint} />
                  </Pressable>
                </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="search" size={36} color={tokens.semantic.border.subtle} />
              <KoolaText tone="muted" style={styles.emptyStateText}>Tìm cuộc trò chuyện, liên hệ, tin nhắn</KoolaText>
              <View style={styles.suggestRow}>
                <View style={styles.suggestChip}>
                  <MaterialIcons name="chat-bubble-outline" size={14} color={tokens.semantic.text.muted} />
                  <KoolaText variant="caption" tone="muted" weight="500">Cuộc trò chuyện</KoolaText>
                </View>
                <View style={styles.suggestChip}>
                  <MaterialIcons name="person-outline" size={14} color={tokens.semantic.text.muted} />
                  <KoolaText variant="caption" tone="muted" weight="500">Liên hệ</KoolaText>
                </View>
                <View style={styles.suggestChip}>
                  <MaterialIcons name="message" size={14} color={tokens.semantic.text.muted} />
                  <KoolaText variant="caption" tone="muted" weight="500">Tin nhắn</KoolaText>
                </View>
              </View>
            </View>
          )
        )}

        {!isQueryShort && (
          <>
            {/* Conversations section */}
            <KoolaText variant="caption" weight="700" tone="muted" style={styles.sectionLabel}>Cuộc trò chuyện</KoolaText>
            {visibleConvs.length === 0 ? (
              <KoolaText tone="muted" style={styles.emptyText}>Không tìm thấy kết quả</KoolaText>
            ) : (
              visibleConvs.map((conv) => {
                const { displayName, avatar } = resolveConversationHeader(conv, user?._id);
                return (
                  <ConversationResultItem
                    key={conv._id}
                    conversation={conv}
                    displayName={displayName}
                    avatar={avatar}
                    onPress={() => handleConversationPress(conv)}
                  />
                );
              })
            )}
            {convResults.length > COLLAPSED_MAX && !expandedConversations && (
              <Pressable style={styles.seeMoreButton} onPress={() => setExpandedConversations(true)} accessibilityRole="button">
                <KoolaText tone="primary" weight="600">Xem thêm</KoolaText>
              </Pressable>
            )}

            <View style={styles.divider} />

            {/* Contacts section */}
            <KoolaText variant="caption" weight="700" tone="muted" style={styles.sectionLabel}>Liên hệ</KoolaText>
            {loadingContacts ? (
              <ActivityIndicator style={styles.loader} size="small" color={tokens.semantic.action.primary} />
            ) : visibleContacts.length === 0 ? (
              <KoolaText tone="muted" style={styles.emptyText}>Không tìm thấy kết quả</KoolaText>
            ) : (
              visibleContacts.map((contact) => (
                <ContactResultItem
                  key={contact._id}
                  contact={contact}
                  onPress={() => handleContactPress(contact._id)}
                />
              ))
            )}
            {!loadingContacts && contacts.length > COLLAPSED_MAX && !expandedContacts && (
              <Pressable style={styles.seeMoreButton} onPress={() => setExpandedContacts(true)} accessibilityRole="button">
                <KoolaText tone="primary" weight="600">Xem thêm</KoolaText>
              </Pressable>
            )}

            <View style={styles.divider} />

            {/* Messages section */}
            <KoolaText variant="caption" weight="700" tone="muted" style={styles.sectionLabel}>Tin nhắn</KoolaText>
            {loadingMessages ? (
              <ActivityIndicator style={styles.loader} size="small" color={tokens.semantic.action.primary} />
            ) : visibleMessages.length === 0 ? (
              <KoolaText tone="muted" style={styles.emptyText}>Không tìm thấy kết quả</KoolaText>
            ) : (
              visibleMessages.map((msg) => (
                <MessageResultItem
                  key={msg._id}
                  item={msg}
                  onPress={() => handleMessagePress(msg.conversationId)}
                />
              ))
            )}
            {!loadingMessages && messages.length > COLLAPSED_MAX && !expandedMessages && (
              <Pressable style={styles.seeMoreButton} onPress={() => setExpandedMessages(true)} accessibilityRole="button">
                <KoolaText tone="primary" weight="600">Xem thêm</KoolaText>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: semantic.bg.canvas,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingBottom: 10,
      backgroundColor: semantic.surface.level0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: semantic.border.subtle,
    },
    backButton: {
      padding: 8,
      marginRight: 4,
    },
    inputWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: semantic.surface.level1,
      borderRadius: 20,
      paddingHorizontal: 12,
      height: 40,
      gap: 8,
    },
    searchIcon: {
      flexShrink: 0,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: semantic.text.primary,
      padding: 0,
    },
    scroll: {
      flex: 1,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 40,
      paddingBottom: 24,
    },
    emptyStateText: {
      marginTop: 10,
    },
    suggestRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginTop: 16,
      paddingHorizontal: 24,
    },
    suggestChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: semantic.surface.level1,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    sectionLabel: {
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 6,
    },
    emptyText: {
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    divider: {
      height: 8,
      backgroundColor: semantic.surface.level1,
      marginTop: 8,
    },
    loader: {
      paddingVertical: 16,
    },
    seeMoreButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    recentHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
    },
    recentTitle: {
      fontSize: 14,
    },
    recentItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    recentItemContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    recentItemText: {
      flex: 1,
    },
    recentRemoveButton: {
      padding: 6,
      marginLeft: 8,
    },
  });

export default UniversalSearchScreen;
