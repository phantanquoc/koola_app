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
  // ─── conversation-quick-actions: private per-user prefs (server-authoritative)
  /** True when the caller pinned this conversation (pinnedAt != null). */
  pinned?: boolean;
  /** Push-mute expiry ISO string; muted iff > now; null when unmuted. */
  mutedUntil?: string | null;
  /** "Clear for me" history cutoff ISO string; null when never cleared. */
  clearedAt?: string | null;
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

/**
 * Role inside a business account, highest to lowest privilege.
 * Mirrors the backend's business_members.role values; the hierarchy is
 * owner > admin > editor > viewer.
 */
export type BusinessRole = 'owner' | 'admin' | 'editor' | 'viewer';

/**
 * Privilege level per role. Mirrors the backend's roleHierarchy
 * (business-members.controller.ts) — keep the two in sync.
 */
export const BUSINESS_ROLE_LEVEL: Record<BusinessRole, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

/**
 * Actions guarded by a business role.
 *
 * Mirrors the matrix served by `GET /permissions/matrix`
 * (business-members.controller.ts). The client copy lets the UI hide controls
 * without a round-trip — the backend still enforces every action via
 * BusinessRoleGuard, so this is a UX affordance, never the security boundary.
 *
 * Kept here (plain data, no imports) rather than inside the
 * useBusinessPermissions module so tests and non-React callers can read the
 * matrix without pulling in AuthContext and the navigator tree behind it.
 */
export type BusinessPermission =
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  | 'order.process'
  | 'order.refund'
  | 'member.invite'
  | 'member.remove'
  | 'member.changeRole'
  | 'business.settings'
  | 'business.delete'
  | 'analytics.view';

/** Minimum role per action, from the backend matrix. */
export const PERMISSION_MIN_ROLE: Record<BusinessPermission, BusinessRole> = {
  'product.create': 'editor',
  'product.update': 'editor',
  'product.delete': 'editor',
  'order.process': 'editor',
  'order.refund': 'admin',
  'member.invite': 'admin',
  'member.remove': 'admin',
  'member.changeRole': 'admin',
  'business.settings': 'admin',
  'business.delete': 'owner',
  'analytics.view': 'viewer',
};

/** Vietnamese label per role, for toasts and badges. */
export const BUSINESS_ROLE_LABEL: Record<BusinessRole, string> = {
  owner: 'Chủ sở hữu',
  admin: 'Quản trị viên',
  editor: 'Biên tập viên',
  viewer: 'Người xem',
};

export interface Account {
  _id: string;
  displayName: string;
  avatar?: string;
  accountType: AccountType;
  verificationStatus?: VerificationStatus;
  logoKey?: string;
  /** Only set on business accounts */
  ownerUserId?: string;
  /** Role for member businesses (owner/admin/editor/viewer). Undefined for personal accounts. */
  role?: BusinessRole;
  /** Display name of the business owner (only set for member businesses where user is not owner) */
  ownerDisplayName?: string;
  /**
   * True when the user joined this business as a member rather than owning it.
   * Lets the account switcher group "your accounts" vs "member accounts".
   */
  isMember?: boolean;
  /**
   * Active member count, set on OWNED businesses only (`GET /accounts`
   * computes it with one grouped count over `business_members`). Absent on
   * personal and member accounts.
   */
  memberCount?: number;
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
