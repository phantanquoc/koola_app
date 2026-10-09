import React from 'react';
import { useFocusEffect } from '@react-navigation/native';

export type ConnectHeaderConfig = {
  title: string;
  onBack: () => void;
  transparent?: boolean;
  _id: symbol;
};

export type ConnectHeaderContextValue = {
  config: ConnectHeaderConfig | null;
  setConfig: (
    next: ConnectHeaderConfig | null | ((prev: ConnectHeaderConfig | null) => ConnectHeaderConfig | null),
  ) => void;
};

export const ConnectHeaderContext = React.createContext<ConnectHeaderContextValue | null>(null);

export const useConnectNavHeader = (title: string, onBack: () => void, opts?: { transparent?: boolean }) => {
  const ctx = React.useContext(ConnectHeaderContext);
  const setConfig = ctx?.setConfig;
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;
  const idRef = React.useRef(Symbol('connect-nav'));
  const transparent = opts?.transparent ?? false;

  useFocusEffect(
    React.useCallback(() => {
      if (!setConfig) return;
      const id = idRef.current;
      setConfig({ title, onBack: () => onBackRef.current(), transparent, _id: id });
      return () => setConfig((prev) => (prev?._id === id ? null : prev));
    }, [setConfig, title, transparent]),
  );
};
