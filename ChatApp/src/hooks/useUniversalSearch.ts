import { useState, useEffect, useCallback, useRef } from 'react';
import { Conversation, UserSearchResult, MessageSearchItem } from '../types';
import { usersApi, messagesApi } from '../services/api/apiService';

export interface UniversalSearchResults {
  conversations: Conversation[];
  contacts: UserSearchResult[];
  messages: MessageSearchItem[];
  loadingContacts: boolean;
  loadingMessages: boolean;
  error: string | null;
}

/**
 * Hook that debounces a search query and fires three concurrent searches:
 *  - Conversations: client-side filter over the provided in-memory list
 *  - Contacts: GET /users/search?q=
 *  - Messages: GET /messages/search?q=
 *
 * All results and loading flags are reset when the query drops below 2 characters.
 */
export function useUniversalSearch(
  query: string,
  conversations: Conversation[],
): UniversalSearchResults {
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [contacts, setContacts] = useState<UserSearchResult[]>([]);
  const [messages, setMessages] = useState<MessageSearchItem[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // In-flight request abort flags (simple boolean — each effect run resets stale state)
  const contactsAbortRef = useRef(false);
  const messagesAbortRef = useRef(false);

  // Debounce: 300 ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Search contacts
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setContacts([]);
      setLoadingContacts(false);
      return;
    }

    contactsAbortRef.current = false;
    setLoadingContacts(true);
    setError(null);

    usersApi
      .searchUsers(debouncedQuery)
      .then((res) => {
        if (!contactsAbortRef.current) {
          setContacts(res.items);
        }
      })
      .catch(() => {
        if (!contactsAbortRef.current) {
          setError('Không thể tải danh sách liên hệ');
        }
      })
      .finally(() => {
        if (!contactsAbortRef.current) {
          setLoadingContacts(false);
        }
      });
  }, [debouncedQuery]);

  // Search messages
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    messagesAbortRef.current = false;
    setLoadingMessages(true);

    messagesApi
      .searchMessages(debouncedQuery)
      .then((res) => {
        if (!messagesAbortRef.current) {
          setMessages(res.items);
        }
      })
      .catch(() => {
        if (!messagesAbortRef.current) {
          setError('Không thể tải tin nhắn');
        }
      })
      .finally(() => {
        if (!messagesAbortRef.current) {
          setLoadingMessages(false);
        }
      });
  }, [debouncedQuery]);

  // Client-side conversation filter
  const filteredConversations = useCallback((): Conversation[] => {
    if (debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    return conversations.filter((conv) => {
      // Match conversation name
      if (conv.name?.toLowerCase().includes(q)) return true;
      // Match any member display name
      return conv.members.some((m) =>
        m.user?.displayName?.toLowerCase().includes(q),
      );
    });
  }, [debouncedQuery, conversations]);

  // Reset results when query drops below threshold
  useEffect(() => {
    if (query.length < 2) {
      contactsAbortRef.current = true;
      messagesAbortRef.current = true;
      setContacts([]);
      setMessages([]);
      setError(null);
    }
  }, [query]);

  return {
    conversations: filteredConversations(),
    contacts,
    messages,
    loadingContacts,
    loadingMessages,
    error,
  };
}
