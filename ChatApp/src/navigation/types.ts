import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { RouteProp } from '@react-navigation/native';

// ─── Auth Stack ────────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

// ─── Chats Stack ──────────────────────────────────────────────────────────────
export type ChatsStackParamList = {
  ConversationList: undefined;
  Chat: { conversationId: string };
};

// ─── Contacts Stack ────────────────────────────────────────────────────────────
export type ContactsStackParamList = {
  Contacts: undefined;
  Profile: { userId: string };
};

// ─── Settings Stack ────────────────────────────────────────────────────────────
export type SettingsStackParamList = {
  Settings: undefined;
  MyProfile: undefined;
  EditProfile: undefined;
};

// ─── Call Stack ────────────────────────────────────────────────────────────────
export type CallStackParamList = {
  Call: {
    sessionId: string;
    callType: 'audio' | 'video';
    isInitiator: boolean;
  };
};

// ─── Main Tab ─────────────────────────────────────────────────────────────────
export type MainTabParamList = {
  ChatsTab: undefined;
  ContactsTab: undefined;
  SettingsTab: undefined;
};

// ─── Root Stack ───────────────────────────────────────────────────────────────
export type RootStackParamList = {
  AuthGroup: undefined;
  MainGroup: undefined;
  CallModal: undefined;
};

// ─── Screen Props ───────────────────────────────────────────────────────────────
// Auth screens
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;
export type RegisterScreenProps = NativeStackScreenProps<AuthStackParamList, 'Register'>;

// Stack screens (inside native stacks)
export type ConversationListScreenProps = NativeStackScreenProps<ChatsStackParamList, 'ConversationList'>;
export type ChatScreenProps = NativeStackScreenProps<ChatsStackParamList, 'Chat'>;
export type ContactsScreenProps = NativeStackScreenProps<ContactsStackParamList, 'Contacts'>;
export type ProfileScreenProps = NativeStackScreenProps<ContactsStackParamList, 'Profile'>;
export type SettingsScreenProps = NativeStackScreenProps<SettingsStackParamList, 'Settings'>;
export type MyProfileScreenProps = NativeStackScreenProps<SettingsStackParamList, 'MyProfile'>;
export type EditProfileScreenProps = NativeStackScreenProps<SettingsStackParamList, 'EditProfile'>;
export type CallScreenProps = NativeStackScreenProps<CallStackParamList, 'Call'>;
