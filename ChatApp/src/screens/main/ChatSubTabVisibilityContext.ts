import React from 'react';
import type { SharedValue } from 'react-native-reanimated';

export type ChatSubTabVisibilityContextValue = {
  hiddenProgress: SharedValue<number>;
};

export const ChatSubTabVisibilityContext =
  React.createContext<ChatSubTabVisibilityContextValue | null>(null);
