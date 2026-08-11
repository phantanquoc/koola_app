import type { CompositeNavigationProp, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { MaterialTopTabNavigationProp } from '@react-navigation/material-top-tabs';

// ─── Auth Stack ──────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  OtpVerify: { email: string };
  ForgotPassword: undefined;
  ResetPassword: { email: string };
};

// ─── Chat Sub-Tabs (top tabs inside ChatHomeScreen) ──────────────────────────
export type ChatSubTabParamList = {
  Messages: undefined;
  Contacts: undefined;
  Moments: undefined;
  Calls: undefined;
  Shorts: undefined;
};

// ─── Chat Tab Stack ───────────────────────────────────────────────────────────
export type ChatTabStackParamList = {
  ChatHome: { resetToMessages?: boolean } | undefined;
  Chat: { conversationId: string; displayName?: string; avatar?: string; targetMessageId?: string };
  GroupInfo: { conversationId: string };
  Profile: { userId: string };
  UniversalSearch: undefined;
  OutboxDevPanel: undefined;
  LogoLab: undefined;
  // Moments screens
  MomentComposer: undefined;
  MomentViewer: { authorId: string; startStoryId: string };
  Highlights: { userId: string; isOwn: boolean };
  AudienceListEditor: { listId?: string };
};

// ─── Connect Tab Stack ────────────────────────────────────────────────────────
export type ConnectTabStackParamList = {
  ConnectHome: undefined;
  BusinessProfile: { businessId: string };
  BusinessSearch: undefined;
};

// ─── Personal Tab Stack ───────────────────────────────────────────────────────
export type PersonalTabStackParamList = {
  PersonalHome: undefined;
  EditProfile: undefined;
  StorageSettings: undefined;
  AccountList: undefined;
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
  // Unauthenticated group (conditionally present — see RootNavigator).
  // Kept in the SAME navigator as the authenticated screens so logout swaps
  // only the screen set, never the whole navigator (a full navigator swap
  // unmounts the entire Main tree in one Fabric commit while the animated tab
  // dock is still mutating views → removeViewAt crash).
  Login: undefined;
  Register: undefined;
  OtpVerify: { email: string };
  ForgotPassword: undefined;
  ResetPassword: { email: string };
  // Authenticated group
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
    imageUrls?: string[];
    initialIndex?: number;
  };
  CoverPhotoViewer: {
    mediaKey: string;
  };
  // Logout transition screen — keeps NavigationContainer mounted while RNS
  // natively pops modals and replaces Main before the auth group swap.
  // See [[logout_removeviewat_crash]] and AuthContext.logout().
  LogoutTransition: undefined;
};;

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
