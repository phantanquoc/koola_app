// User
export interface User {
  _id: string;
  email: string;
  displayName: string;
  avatar?: string;
  isOnline: boolean;
  lastSeen: string;
}

// Conversation
export interface Conversation {
  _id: string;
  type: 'direct' | 'group';
  name?: string;
  avatar?: string;
  members: User[];
  lastMessage?: Message;
  lastMessageAt?: string;
  unreadCount: number;
}

export interface ConversationListResponse {
  conversations: Conversation[];
  hasMore: boolean;
  total: number;
}

// Message
export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  sender?: User;
  type: 'text' | 'image' | 'file' | 'voice' | 'system';
  content: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaSize?: number;
  thumbnailKey?: string;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// Auth
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  displayName: string;
}
