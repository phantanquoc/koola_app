import type { CompositeNavigationProp, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

// ─── Auth Stack ──────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

// ─── Chats Stack ─────────────────────────────────────────────────────────────
export type ChatsStackParamList = {
  ConversationList: undefined;
  Chat: { conversationId: string };
};

// ─── Contacts Stack ──────────────────────────────────────────────────────────
export type ContactsStackParamList = {
  Contacts: undefined;
  Profile: { userId: string };
};

// ─── Settings Stack ──────────────────────────────────────────────────────────
export type SettingsStackParamList = {
  Settings: undefined;
  MyProfile: undefined;
  EditProfile: undefined;
};

// ─── Call Stack ──────────────────────────────────────────────────────────────
export type CallStackParamList = {
  Call: {
    sessionId: string;
    callType: 'audio' | 'video';
    isInitiator: boolean;
  };
};

// ─── Main Bottom Tabs ────────────────────────────────────────────────────────
export type MainTabParamList = {
  ChatsTab: undefined;
  ContactsTab: undefined;
  SettingsTab: undefined;
};

// ─── Root Stack ──────────────────────────────────────────────────────────────
export type RootStackParamList = {
  Main: undefined;
  CallModal: CallStackParamList['Call'];
};

// ─── Composite Navigation Types ──────────────────────────────────────────────

export type ConversationListScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<ChatsStackParamList, 'ConversationList'>,
  BottomTabNavigationProp<MainTabParamList>
>;

export type ChatScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<ChatsStackParamList, 'Chat'>,
  BottomTabNavigationProp<MainTabParamList>
>;

export type ContactsScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<ContactsStackParamList, 'Contacts'>,
  BottomTabNavigationProp<MainTabParamList>
>;

export type ProfileScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<ContactsStackParamList, 'Profile'>,
  BottomTabNavigationProp<MainTabParamList>
>;

// ─── Route Props ─────────────────────────────────────────────────────────────

export type ChatScreenRouteProp = RouteProp<ChatsStackParamList, 'Chat'>;
export type ProfileScreenRouteProp = RouteProp<ContactsStackParamList, 'Profile'>;
export type CallScreenRouteProp = RouteProp<CallStackParamList, 'Call'>;
