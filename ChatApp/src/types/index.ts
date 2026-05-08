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
  phone?: string;
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

export type MessageType = 'text' | 'image' | 'file' | 'voice' | 'video' | 'system';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageReaction {
  userId: string;
  emoji: string;
}

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
  mediaDuration?: number | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  blurhash?: string | null;
  reactions?: MessageReaction[];
  deletedFor?: string[];
  readBy?: string[];
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


// ─── Pinned Message ────────────────────────────────────────────────────────────

export interface PinnedMessage {
  messageId: string;
  pinnedBy: string;
  pinnedAt: string;
}

// ─── Message Search ────────────────────────────────────────────────────────────

export interface MessageSearchItem {
  _id: string;
  conversationId: string;
  conversationName: string;
  senderId: string;
  senderDisplayName: string;
  content: string;
  type: MessageType;
  createdAt: string;
}

// ─── Business / Connect Tab ────────────────────────────────────────────────────

export type RelationshipType = 'partner' | 'supplier';

export interface BusinessCategory {
  slug: string;
  label: string;
  icon: string;
}

export interface BusinessConnectedUser {
  _id: string;
  displayName: string;
  avatar?: string;
}

export interface Business {
  _id: string;
  name: string;
  logoKey?: string;
  tagline?: string;
  description?: string;
  relationshipType: RelationshipType;
  category: string;
  province: string;
  address?: string;
  website?: string;
  contactEmail?: string;
  contactPhone?: string;
  ownerId: string;
  connectionCount: number;
  connectedUsers?: BusinessConnectedUser[];
  isConnected?: boolean;
  isVerified?: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateBusinessPayload {
  name: string;
  relationshipType: RelationshipType;
  category: string;
  province: string;
  tagline?: string;
  description?: string;
  address?: string;
  website?: string;
  contactEmail?: string;
  contactPhone?: string;
  logoKey?: string;
}

export interface BusinessListResponse {
  items: Business[];
  hasMore: boolean;
  nextCursor: string | null;
}

// ─── Recent Searches (client-side) ─────────────────────────────────────────────

export interface RecentSearchItem {
  query: string;
  searchedAt: string;
}
