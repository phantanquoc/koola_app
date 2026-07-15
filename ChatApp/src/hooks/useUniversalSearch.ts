import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { Conversation, UserSearchResult, MessageSearchItem } from '../types';
import { usersApi, messagesApi } from '../services/api/apiService';

export interface SectionState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

export interface UniversalSearchResults {
  conversations: Conversation[];
  contacts: SectionState<UserSearchResult>;
  messages: SectionState<MessageSearchItem>;
  /** Retry only the contacts section for the current query */
  retryContacts: () => void;
  /** Retry only the messages section for the current query */
  retryMessages: () => void;
  // Legacy compat — these map to section state for backward compatibility
  loadingContacts: boolean;
  loadingMessages: boolean;
}

/**
 * Hook that debounces a search query and fires three concurrent searches:
 *  - Conversations: client-side filter over the provided in-memory list
 *  - Contacts: GET /users/search?q=
 *  - Messages: GET /messages/search?q=
 *
 * Each section maintains INDEPENDENT loading/error/empty state. A failure
 * in one section does not affect the others. Retry re-runs only the failed
 * section.
 */
export function useUniversalSearch(
  query: string,
  conversations: Conversation[],
): UniversalSearchResults {
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [contacts, setContacts] = useState<SectionState<UserSearchResult>>({
    data: [],
    loading: false,
    error: null,
  });
  const [messages, setMessages] = useState<SectionState<MessageSearchItem>>({
    data: [],
    loading: false,
    error: null,
  });
  const [contactsRetryCount, setContactsRetryCount] = useState(0);
  const [messagesRetryCount, setMessagesRetryCount] = useState(0);
  const contactsAbortRef = useRef<AbortController | null>(null);
  const messagesAbortRef = useRef<AbortController | null>(null);

  // Debounce: 300 ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Search contacts — independent lifecycle
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setContacts({ data: [], loading: false, error: null });
      return;
    }

    // Abort any in-flight request
    contactsAbortRef.current?.abort();
    const ctrl = new AbortController();
    contactsAbortRef.current = ctrl;

    setContacts((prev) => ({ ...prev, loading: true, error: null }));

    usersApi
      .searchUsers(debouncedQuery, undefined, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        setContacts({ data: res.items, loading: false, error: null });
      })
      .catch((err) => {
        if (axios.isCancel(err) || ctrl.signal.aborted) return;
        setContacts((prev) => ({
          ...prev,
          loading: false,
          error: 'Tìm kiếm thất bại. Nhấn để thử lại.',
        }));
      });

    return () => ctrl.abort();
  }, [debouncedQuery, contactsRetryCount]);

  // Search messages — independent lifecycle
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setMessages({ data: [], loading: false, error: null });
      return;
    }

    messagesAbortRef.current?.abort();
    const ctrl = new AbortController();
    messagesAbortRef.current = ctrl;

    setMessages((prev) => ({ ...prev, loading: true, error: null }));

    messagesApi
      .searchMessages(debouncedQuery, undefined, undefined, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        setMessages({ data: res.items, loading: false, error: null });
      })
      .catch((err) => {
        if (axios.isCancel(err) || ctrl.signal.aborted) return;
        setMessages((prev) => ({
          ...prev,
          loading: false,
          error: 'Không thể tải tin nhắn. Nhấn để thử lại.',
        }));
      });

    return () => ctrl.abort();
  }, [debouncedQuery, messagesRetryCount]);

  // Client-side conversation filter
  const filteredConversations = useMemo<Conversation[]>(() => {
    if (debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    return conversations.filter((conv) => {
      if (conv.name?.toLowerCase().includes(q)) return true;
      return conv.members.some((m) =>
        m.user?.displayName?.toLowerCase().includes(q),
      );
    });
  }, [debouncedQuery, conversations]);

  // Reset results when query drops below threshold
  useEffect(() => {
    if (query.length < 2) {
      setContacts({ data: [], loading: false, error: null });
      setMessages({ data: [], loading: false, error: null });
    }
  }, [query]);

  // Retry functions — only re-trigger the failed section
  const retryContacts = useCallback(() => {
    setContactsRetryCount((c) => c + 1);
  }, []);

  const retryMessages = useCallback(() => {
    setMessagesRetryCount((c) => c + 1);
  }, []);

  return {
    conversations: filteredConversations,
    contacts,
    messages,
    retryContacts,
    retryMessages,
    // Legacy compat
    loadingContacts: contacts.loading,
    loadingMessages: messages.loading,
  };
}
