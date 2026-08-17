// ─── User ──────────────────────────────────────────────────────────────────────

export type UserGender = 'male' | 'female' | 'other' | 'prefer_not';

export interface User {
  _id: string;
  email: string;
  phone?: string;
  displayName: string;
  avatar: string;
  bio?: string;
  username?: string;
  coverPhoto?: string;
  dateOfBirth?: string; // ISO 8601
  gender?: UserGender;
  isOnline: boolean;
  lastSeen: string;
  settings: {
    notificationsEnabled: boolean;
    /** ISO 639-1 target language for translation. Default "vi". */
    preferredLanguage?: string;
    /** Whether incoming foreign-language messages are auto-translated. */
    autoTranslateEnabled?: boolean;
  };
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
  pinnedMessages?: PinnedMessage[];
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
  mediaThumbnailKey?: string | null;
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

export interface MessageAroundResponse {
  messages: Message[];
  hasBefore: boolean;
  hasAfter: boolean;
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

// ─── Account (polymorphic user identity) ──────────────────────────────────────

export type AccountType = 'personal' | 'business';
export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface Account {
  _id: string;
  displayName: string;
  avatar?: string;
  accountType: AccountType;
  verificationStatus?: VerificationStatus;
  logoKey?: string;
  /** Only set on business accounts */
  ownerUserId?: string;
}

export interface CreateBusinessAccountPayload {
  displayName: string;
  businessCategory: string;
  province: string;
  relationshipType: 'partner' | 'supplier';
  licenseImageKey: string;
  tagline?: string;
  description?: string;
  address?: string;
  website?: string;
  contactEmail?: string;
  contactPhone?: string;
  logoKey?: string;
}

// ─── Business / Connect Tab ────────────────────────────────────────────────────

export type BusinessSort = 'latest' | 'popular' | 'name';

export interface BusinessCategory {
  slug: string;
  label: string;
  icon: string;
}

// ─── Recent Searches (client-side) ─────────────────────────────────────────────

export interface RecentSearchItem {
  query: string;
  searchedAt: string;
}

// ─── Translation ──────────────────────────────────────────────────────────────

/** Result returned by POST /api/translate and cached locally. */
export interface TranslateResult {
  translatedText: string;
  sourceLang: string;
  cached: boolean;
}

/** UI state threaded into MessageItem via IMessage & Record<string, unknown>. */
export interface TranslatedTextState {
  translatedText: string;
  isLoading: boolean;
  error: boolean;
  collapsed: boolean;
}
