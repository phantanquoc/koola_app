import React from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Lets ChatScreen take over the shared NotchHeader band (back + avatar +
 * name + status + call actions instead of the KOOLA wordmark). The header is
 * rendered as a fixed sibling of the Stack.Navigator so it cannot read the
 * inner route itself — ChatScreen registers its config on focus and releases
 * it on blur. Mirrors PersonalHeaderContext, but with the richer payload
 * Chat's header needs.
 */
export type ChatHeaderConfig = {
  title: string;
  status: string | null;
  avatarKey: string;
  onBack: () => void;
  onHeaderPress: () => void;
  onStartCall: (callType: 'audio' | 'video') => void;
};

export type ChatHeaderContextValue = {
  config: ChatHeaderConfig | null;
  setConfig: (next: ChatHeaderConfig | null) => void;
};

export const ChatHeaderContext =
  React.createContext<ChatHeaderContextValue | null>(null);

type ChatNavHeaderArgs = {
  title: string;
  status: string | null;
  avatarKey: string;
  onBack: () => void;
  onHeaderPress: () => void;
  onStartCall: (callType: 'audio' | 'video') => void;
};

/**
 * Claim the shared notch band while ChatScreen is focused. Callback props are
 * kept in refs (same pattern as PersonalHeaderContext.tsx) so the focus
 * effect's dependency list never contains a raw callback identity — a
 * callback that changes identity every render must not re-run the effect.
 */
export const useChatNavHeader = ({
  title,
  status,
  avatarKey,
  onBack,
  onHeaderPress,
  onStartCall,
}: ChatNavHeaderArgs) => {
  const ctx = React.useContext(ChatHeaderContext);
  const setConfig = ctx?.setConfig;

  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;
  const onHeaderPressRef = React.useRef(onHeaderPress);
  onHeaderPressRef.current = onHeaderPress;
  const onStartCallRef = React.useRef(onStartCall);
  onStartCallRef.current = onStartCall;

  useFocusEffect(
    React.useCallback(() => {
      if (!setConfig) return;
      setConfig({
        title,
        status,
        avatarKey,
        onBack: () => onBackRef.current(),
        onHeaderPress: () => onHeaderPressRef.current(),
        onStartCall: (callType: 'audio' | 'video') => onStartCallRef.current(callType),
      });
      return () => setConfig(null);
    }, [setConfig, title, status, avatarKey]),
  );
};
