import React from 'react';
import type { SharedValue } from 'react-native-reanimated';

export type ChatSubTabVisibilityContextValue = {
  /** 0 = sub-tab bar shown, 1 = hidden (scrolled down). */
  hiddenProgress: SharedValue<number>;
  /**
   * 0 = list at rest at the top, 1 = content has scrolled under the chrome.
   * Drives the glass chrome's elevation shadow so it only "lifts" off the
   * page when there is content behind it.
   */
  scrolledProgress: SharedValue<number>;
};

/** Scroll distance (px) over which the chrome shadow fades in. */
export const CHAT_CHROME_LIFT_DISTANCE = 24;

export const ChatSubTabVisibilityContext =
  React.createContext<ChatSubTabVisibilityContextValue | null>(null);
