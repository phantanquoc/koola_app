import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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

const COLLAPSED_MAX = 3;
const EXPANDED_MAX = 20;

/**
 * Resolve the display name + avatar to show for a conversation in a universal
 * search list. Mirrors the logic inside ConversationListItem so rows here match
 * the chat list exactly.
 */
function resolveConversationHeader(
  conv: Conversation,
  currentUserId?: string,
): { displayName: string; avatar?: string } {
  if (conv.type === 'group') {
    return {
      displayName: conv.name || 'Group',
      avatar: conv.avatar || undefined,
    };
  }
  const other = conv.members.find((m) => m.userId !== currentUserId);
  return {
    displayName: other?.user?.displayName || 'Unknown User',
    avatar: other?.user?.avatar || undefined,
  };
}

const Divider = () => <View style={styles.divider} />;

const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <Text style={styles.sectionLabel}>{label}</Text>
);

const EmptySection: React.FC = () => (
  <Text style={styles.emptyText}>Không tìm thấy kết quả</Text>
);

const SeeMoreButton: React.FC<{ onPress: () => void }> = ({ onPress }) => (
  <TouchableOpacity style={styles.seeMoreButton} onPress={onPress} activeOpacity={0.7}>
    <Text style={styles.seeMoreText}>Xem thêm</Text>
  </TouchableOpacity>
);

const UniversalSearchScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabStackParamList>>();
  const { user } = useAuth();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [expandedConversations, setExpandedConversations] = useState(false);
  const [expandedContacts, setExpandedContacts] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);

  // Fetch the first page of conversations once on mount for client-side filtering
  useEffect(() => {
    conversationsApi.list(1, 50).then((res) => {
      setConversations(res.conversations);
    }).catch(() => {
      // Non-critical — conversation section will show empty
    });
  }, []);

  // Load recent searches on mount
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

  // Sliced result lists based on expand state
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
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Quay lại">
          <MaterialIcons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>

        <View style={styles.inputWrapper}>
          <MaterialIcons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Tìm kiếm"
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={handleClear}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Xóa từ khóa">
              <MaterialIcons name="close" size={20} color="#9CA3AF" />
            </TouchableOpacity>
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
                <Text style={styles.recentTitle}>Tìm kiếm gần đây</Text>
                <TouchableOpacity
                  onPress={handleClearAllRecent}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Xóa tất cả lịch sử tìm kiếm">
                  <Text style={styles.clearAllText}>Xóa tất cả</Text>
                </TouchableOpacity>
              </View>
              {recentSearches.map((item) => {
                const term = item.query;
                return (
                <View key={term} style={styles.recentItem}>
                  <TouchableOpacity
                    style={styles.recentItemContent}
                    onPress={() => handleRecentPress(term)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Tìm kiếm ${term}`}>
                    <MaterialIcons name="history" size={20} color="#9CA3AF" />
                    <Text style={styles.recentItemText} numberOfLines={1}>{term}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleRemoveRecent(term)}
                    style={styles.recentRemoveButton}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa ${term} khỏi lịch sử`}>
                    <MaterialIcons name="close" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="search" size={48} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>Nhập từ khóa để tìm kiếm</Text>
            </View>
          )
        )}

        {!isQueryShort && (
          <>
            {/* Conversations section */}
            <SectionLabel label="Cuộc trò chuyện" />
            {visibleConvs.length === 0 ? (
              <EmptySection />
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
              <SeeMoreButton onPress={() => setExpandedConversations(true)} />
            )}

            <Divider />

            {/* Contacts section */}
            <SectionLabel label="Liên hệ" />
            {loadingContacts ? (
              <ActivityIndicator style={styles.loader} size="small" color="#1565C0" />
            ) : visibleContacts.length === 0 ? (
              <EmptySection />
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
              <SeeMoreButton onPress={() => setExpandedContacts(true)} />
            )}

            <Divider />

            {/* Messages section */}
            <SectionLabel label="Tin nhắn" />
            {loadingMessages ? (
              <ActivityIndicator style={styles.loader} size="small" color="#1565C0" />
            ) : visibleMessages.length === 0 ? (
              <EmptySection />
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
              <SeeMoreButton onPress={() => setExpandedMessages(true)} />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: (StatusBar.currentHeight || 0) + 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
    marginRight: 4,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 22,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchIcon: {
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    padding: 0,
  },
  scroll: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingBottom: 40,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#9CA3AF',
    marginTop: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  divider: {
    height: 8,
    backgroundColor: '#F9FAFB',
    marginTop: 8,
  },
  loader: {
    paddingVertical: 16,
  },
  seeMoreButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  seeMoreText: {
    fontSize: 14,
    color: '#1565C0',
    fontWeight: '600',
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
    fontWeight: '600',
    color: '#374151',
  },
  clearAllText: {
    fontSize: 13,
    color: '#1565C0',
    fontWeight: '500',
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
    fontSize: 15,
    color: '#111827',
  },
  recentRemoveButton: {
    padding: 6,
    marginLeft: 8,
  },
});

export default UniversalSearchScreen;
