import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
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
 * In-flight HTTP requests are aborted via AbortController when the query
 * changes or the component unmounts, so rapid typing does not pile up
 * concurrent requests on the server.
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

    const ctrl = new AbortController();
    setLoadingContacts(true);
    setError(null);

    usersApi
      .searchUsers(debouncedQuery, undefined, ctrl.signal)
      .then((res) => {
        setContacts(res.items);
      })
      .catch((err) => {
        // Ignore cancellations — they are expected when the query changes.
        if (axios.isCancel(err) || ctrl.signal.aborted) return;
        setError('Không thể tải danh sách liên hệ');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingContacts(false);
      });

    return () => ctrl.abort();
  }, [debouncedQuery]);

  // Search messages
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    const ctrl = new AbortController();
    setLoadingMessages(true);

    messagesApi
      .searchMessages(debouncedQuery, undefined, undefined, ctrl.signal)
      .then((res) => {
        setMessages(res.items);
      })
      .catch((err) => {
        if (axios.isCancel(err) || ctrl.signal.aborted) return;
        setError('Không thể tải tin nhắn');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingMessages(false);
      });

    return () => ctrl.abort();
  }, [debouncedQuery]);

  // Client-side conversation filter — memoized so callers don't re-run filter
  // on every render even when inputs are unchanged.
  const filteredConversations = useMemo<Conversation[]>(() => {
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
      setContacts([]);
      setMessages([]);
      setError(null);
    }
  }, [query]);

  return {
    conversations: filteredConversations,
    contacts,
    messages,
    loadingContacts,
    loadingMessages,
    error,
  };
}
