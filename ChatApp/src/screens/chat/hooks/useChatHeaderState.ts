import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import {
  useNavigation,
  type NavigationProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { conversationsApi } from '../../../services/api/apiService';
import {
  getOrDownload,
  getFromMemory,
} from '../../../services/media/mediaCacheService';
import * as conversationRepository from '../../../services/db/conversationRepository';
import type { Conversation } from '../../../types';
import type { ChatTabStackParamList } from '../../../navigation/types';

interface UseChatHeaderStateArgs {
  conversationId: string;
  conversation: Conversation | null;
  setConversation: (conv: Conversation) => void;
  currentUserId: string;
  initialDisplayName?: string;
  initialAvatar?: string;
  isFocusedRef: MutableRefObject<boolean>;
  isMountedRef: MutableRefObject<boolean>;
}

interface UseChatHeaderStateResult {
  chatTitle: string;
  otherUserStatus: string | null;
  otherAvatarKey: string;
  otherAvatarUrl: string;
  handleHeaderPress: () => Promise<void>;
}

/**
 * Owns the chat header's state and behaviour: loads the conversation (SQLite-
 * first, then authoritative network refresh), resolves the other member's
 * avatar, derives the title + online status, and handles the header tap
 * (navigate to GroupInfo / Profile).
 *
 * `conversation` + `setConversation` are owned by ChatScreen (shared with the
 * pin and call hooks) and passed in — this hook is the primary loader, the
 * other hooks are consumers.
 */
export function useChatHeaderState({
  conversationId,
  conversation,
  setConversation,
  currentUserId,
  initialDisplayName,
  initialAvatar,
  isFocusedRef,
  isMountedRef,
}: UseChatHeaderStateArgs): UseChatHeaderStateResult {
  const navigation = useNavigation<NavigationProp<ChatTabStackParamList>>();

  // Seed avatar from nav params so the header doesn't flash a placeholder
  // while waiting for /conversations/:id to resolve.
  const [otherAvatarKey, setOtherAvatarKey] = useState<string>(initialAvatar || '');
  const [otherAvatarUrl, setOtherAvatarUrl] = useState<string>(() => {
    if (!initialAvatar) return '';
    // Resolved URI (http/file) — use directly
    if (initialAvatar.startsWith('http') || initialAvatar.startsWith('file://')) return initialAvatar;
    // mediaKey — check memory cache synchronously to avoid placeholder flash
    return getFromMemory(initialAvatar) || '';
  });

  // Fetch conversation details for header name.
  // SQLite-first: populate conversation state synchronously from local DB so
  // chatTitle is stable on first render, then refresh from network in background.
  useEffect(() => {
    // 1. Synchronous SQLite read — non-fatal, falls through to network on error
    try {
      const local = conversationRepository.getById(conversationId);
      if (local) {
        const localConv: Conversation = {
          _id: local.id,
          type: (local.type ?? 'direct') as Conversation['type'],
          name: local.name ?? undefined,
          avatar: local.avatarKey ?? undefined,
          members: Array.isArray(local.members) ? (local.members as Conversation['members']) : [],
          createdBy: '',
          unreadCount: local.unreadCount ?? 0,
          lastMessagePreview: local.lastMessagePreview ?? undefined,
          lastMessageAt: local.lastMessageAt ? new Date(local.lastMessageAt as number).toISOString() : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: local.updatedAt ? new Date(local.updatedAt as number).toISOString() : new Date().toISOString(),
          // pinnedMessages not stored in SQLite — will be populated by network refresh
        };
        setConversation(localConv);
      }
    } catch {
      // non-fatal — network refresh below will populate state
    }

    // 2. Background network refresh for authoritative data (online status, pinnedMessages, populated members)
    conversationsApi.getDetails(conversationId).then((data: { conversation: Conversation }) => {
      // Guard: do not setState on a screen that is being/already popped off the stack
      if (!isFocusedRef.current || !isMountedRef.current) return;
      const conv = data.conversation || data;
      setConversation(conv);
      // Resolve other member's avatar
      if (conv.type !== 'group') {
        const other = conv.members.find((m: any) => {
          const id = typeof m.userId === 'object' ? m.userId._id : m.userId;
          return id !== currentUserId;
        });
        const rawAvatar = other && typeof other.userId === 'object'
          ? (other.userId as any).avatar
          : other?.user?.avatar;
        if (rawAvatar) {
          setOtherAvatarKey(rawAvatar);
          getOrDownload(rawAvatar).then((url) => {
            if (!isFocusedRef.current || !isMountedRef.current) return;
            if (url) setOtherAvatarUrl(url);
          });
        }
      }
    }).catch(() => {});
  }, [conversationId, currentUserId, isFocusedRef, isMountedRef, setConversation]);

  // Warm avatar URL from the mediaKey passed via nav params (cache hit is instant).
  useEffect(() => {
    if (!initialAvatar) return;
    if (initialAvatar.startsWith('http') || initialAvatar.startsWith('file://')) {
      setOtherAvatarUrl(initialAvatar);
      return;
    }
    let cancelled = false;
    getOrDownload(initialAvatar).then((url) => {
      if (!cancelled && url && isFocusedRef.current && isMountedRef.current) setOtherAvatarUrl(url);
    });
    return () => { cancelled = true; };
  }, [initialAvatar, isFocusedRef, isMountedRef]);

  // Derive chat title from conversation
  const chatTitle = (() => {
    if (!conversation) return initialDisplayName || 'Trò chuyện';
    if (conversation.type === 'group') return conversation.name || 'Nhóm';
    // Direct: find the other member - members may be populated (userId is object) or not
    const otherMember = conversation.members.find((m) => {
      if (!m?.userId) return false;
      const id = typeof m.userId === 'object' ? (m.userId as any)?._id : m.userId;
      return Boolean(id) && id !== currentUserId;
    });
    if (!otherMember) return initialDisplayName || 'Trò chuyện';
    // Populated: userId is the user object itself
    if (typeof otherMember.userId === 'object') {
      return (otherMember.userId as any).displayName || initialDisplayName || 'Trò chuyện';
    }
    return otherMember.user?.displayName || initialDisplayName || 'Trò chuyện';
  })();

  // Derive online status for direct chats
  const otherUserStatus = (() => {
    if (!conversation || conversation.type === 'group') return null;
    const otherMember = conversation.members.find((m) => {
      if (!m?.userId) return false;
      const id = typeof m.userId === 'object' ? (m.userId as any)?._id : m.userId;
      return Boolean(id) && id !== currentUserId;
    });
    if (!otherMember) return null;
    // userData can be: populated userId object, or separate .user field
    const userData = typeof otherMember.userId === 'object'
      ? (otherMember.userId as any)
      : otherMember.user;
    if (!userData) return null;
    if (userData.isOnline === true) return 'Đang hoạt động';
    const lastSeen = userData.lastSeen || userData.lastSeenAt;
    if (lastSeen) {
      const lastSeenDate = new Date(lastSeen);
      if (isNaN(lastSeenDate.getTime())) return null;
      const now = new Date();
      const diffMs = now.getTime() - lastSeenDate.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Vừa mới truy cập';
      if (diffMin < 60) return `Hoạt động ${diffMin} phút trước`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `Hoạt động ${diffHours} giờ trước`;
      const diffDays = Math.floor(diffHours / 24);
      return `Hoạt động ${diffDays} ngày trước`;
    }
    return 'Không hoạt động';
  })();

  const handleHeaderPress = useCallback(async () => {
    const nav = navigation as NativeStackNavigationProp<ChatTabStackParamList>;
    let conv = conversation;
    if (!conv) {
      try {
        const data = await conversationsApi.getDetails(conversationId);
        conv = (data.conversation || data) as Conversation;
        // Guard setState only; navigation below is a direct user action and must proceed
        if (isFocusedRef.current && isMountedRef.current) setConversation(conv);
      } catch {
        return;
      }
    }
    if (conv.type === 'group') {
      nav.navigate('GroupInfo', { conversationId });
      return;
    }
    const other = conv.members?.find((m: any) => {
      const id = typeof m.userId === 'object' ? m.userId._id : m.userId;
      return id !== currentUserId;
    });
    if (!other) return;
    const otherUserId =
      typeof other.userId === 'object' ? (other.userId as any)._id : other.userId;
    if (!otherUserId) return;
    nav.navigate('Profile', { userId: otherUserId });
  }, [conversation, conversationId, currentUserId, navigation, isFocusedRef, isMountedRef, setConversation]);


  return { chatTitle, otherUserStatus, otherAvatarKey, otherAvatarUrl, handleHeaderPress };
}
