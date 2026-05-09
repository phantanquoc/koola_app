import type { CompositeNavigationProp, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { MaterialTopTabNavigationProp } from '@react-navigation/material-top-tabs';

// ─── Auth Stack ──────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  OtpVerify: { email: string };
};

// ─── Chat Sub-Tabs (top tabs inside ChatHomeScreen) ──────────────────────────
export type ChatSubTabParamList = {
  Messages: undefined;
  Calls: undefined;
  Contacts: undefined;
  Videos: undefined;
  Journal: undefined;
};

// ─── Chat Tab Stack ───────────────────────────────────────────────────────────
export type ChatTabStackParamList = {
  ChatHome: undefined;
  Chat: { conversationId: string; displayName?: string; avatar?: string };
  GroupInfo: { conversationId: string };
  Profile: { userId: string };
  UniversalSearch: undefined;
};

// ─── Connect Tab Stack ────────────────────────────────────────────────────────
export type ConnectTabStackParamList = {
  ConnectHome: undefined;
  BusinessProfile: { businessId: string };
  BusinessSearch: undefined;
  CreateBusiness: undefined;
};

// ─── Personal Tab Stack ───────────────────────────────────────────────────────
export type PersonalTabStackParamList = {
  PersonalHome: undefined;
  EditProfile: undefined;
};

// ─── Shopping Tab Stack ───────────────────────────────────────────────────────
export type ShoppingTabStackParamList = {
  ShoppingHome: undefined;
};

// ─── Support Tab Stack ────────────────────────────────────────────────────────
export type SupportTabStackParamList = {
  SupportHome: undefined;
};

// ─── Main Bottom Tabs (5 tabs) ────────────────────────────────────────────────
export type MainTabParamList = {
  ChatTab: undefined;
  ShoppingTab: undefined;
  ConnectTab: undefined;
  SupportTab: undefined;
  PersonalTab: undefined;
};

// ─── Call Stack ───────────────────────────────────────────────────────────────
export type CallStackParamList = {
  Call: {
    sessionId: string;
    callType: 'audio' | 'video';
    isInitiator: boolean;
    iceServers?: { urls: string; username?: string; credential?: string }[];
    remoteUser?: { id: string; displayName: string; avatar?: string };
  };
};

// ─── Root Stack ───────────────────────────────────────────────────────────────
export type RootStackParamList = {
  Main: undefined;
  CallModal: CallStackParamList['Call'];
  IncomingCallModal: {
    sessionId: string;
    callType: 'audio' | 'video';
    remoteUser: { id: string; displayName: string; avatar?: string };
    iceServers?: { urls: string; username?: string; credential?: string }[];
  };
  ImageViewer: {
    imageUrl: string;
  };
};

// ─── Composite Navigation Types ───────────────────────────────────────────────

export type ConversationListScreenNavigationProp = CompositeNavigationProp<
  MaterialTopTabNavigationProp<ChatSubTabParamList, 'Messages'>,
  CompositeNavigationProp<
    NativeStackNavigationProp<ChatTabStackParamList>,
    BottomTabNavigationProp<MainTabParamList>
  >
>;

export type ChatScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<ChatTabStackParamList, 'Chat'>,
  CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList>,
    NativeStackNavigationProp<RootStackParamList>
  >
>;

export type ContactsScreenNavigationProp = CompositeNavigationProp<
  MaterialTopTabNavigationProp<ChatSubTabParamList, 'Contacts'>,
  CompositeNavigationProp<
    NativeStackNavigationProp<ChatTabStackParamList>,
    BottomTabNavigationProp<MainTabParamList>
  >
>;

export type ProfileScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<ChatTabStackParamList, 'Profile'>,
  BottomTabNavigationProp<MainTabParamList>
>;

// ─── Route Props ──────────────────────────────────────────────────────────────

export type ChatScreenRouteProp = RouteProp<ChatTabStackParamList, 'Chat'>;
export type ProfileScreenRouteProp = RouteProp<ChatTabStackParamList, 'Profile'>;
export type CallScreenRouteProp = RouteProp<RootStackParamList, 'CallModal'>;
