// ─── User ──────────────────────────────────────────────────────────────────────

export interface User {
  _id: string;
  email: string;
  displayName: string;
  avatar: string;
  isOnline: boolean;
  lastSeen: string;
  settings: { notificationsEnabled: boolean };
}

export interface UserSearchResult {
  _id: string;
  email: string;
  displayName: string;
  avatar?: string;
  isOnline: boolean;
  lastSeen: string;
}

// ─── Conversation ──────────────────────────────────────────────────────────────

export type ConversationType = 'direct' | 'group';
export type MemberRole = 'admin' | 'member';

export interface ConversationMember {
  userId: string;
  role: MemberRole;
  joinedAt: string;
}

export interface Conversation {
  _id: string;
  type: ConversationType;
  name?: string;
  avatar?: string;
  members: (ConversationMember & { user?: User })[];
  createdBy: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  hasMore: boolean;
  total: number;
}

// ─── Message ───────────────────────────────────────────────────────────────────

export type MessageType = 'text' | 'image' | 'file' | 'voice' | 'system';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  status: MessageStatus;
  mediaUrl: string;
  mediaMimeType: string;
  mediaSize: number;
  deleted: boolean;
  clientMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageListResponse {
  messages: Message[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface SyncMessagesResponse {
  items: Message[];
  hasMore: boolean;
  nextCursor: string | null;
}

// ─── Offline Queue ─────────────────────────────────────────────────────────────

export interface QueuedMessage {
  id: string;
  conversationId: string;
  content: string;
  type: MessageType;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaSize?: number;
  status: 'pending' | 'failed';
  createdAt: string;
  retryCount: number;
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  message: string;
}

export interface RegisterResponse extends AuthTokens {
  message: string;
}

// ─── Paginated ─────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}
