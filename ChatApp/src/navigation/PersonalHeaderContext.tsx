import React from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Lets a screen inside PersonalTabStack take over the shared NotchHeader band
 * (back button + title instead of the KOOLA wordmark). The header is rendered
 * as a fixed sibling of the Stack.Navigator so it cannot read the inner route
 * itself — screens register their config on focus and release it on blur.
 */
export type PersonalHeaderConfig = {
  title: string;
  onBack: () => void;
};

export type PersonalHeaderContextValue = {
  config: PersonalHeaderConfig | null;
  setConfig: (next: PersonalHeaderConfig | null) => void;
};

export const PersonalHeaderContext =
  React.createContext<PersonalHeaderContextValue | null>(null);

/** Claim the shared notch band while this screen is focused. */
export const usePersonalNavHeader = (title: string, onBack: () => void) => {
  const ctx = React.useContext(PersonalHeaderContext);
  const setConfig = ctx?.setConfig;
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;

  useFocusEffect(
    React.useCallback(() => {
      if (!setConfig) return;
      setConfig({ title, onBack: () => onBackRef.current() });
      return () => setConfig(null);
    }, [setConfig, title]),
  );
};
