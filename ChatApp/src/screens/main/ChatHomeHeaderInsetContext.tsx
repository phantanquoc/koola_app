import React from 'react';

/** Height of the Chat Home sub-tab bar (CustomTabBar) at rest. */
export const CHAT_SUB_TAB_BAR_HEIGHT = 40;
/** Gap between the sub-tab bar and the first row of every sub-tab scene. */
export const CHAT_HOME_CONTENT_GAP = 8;

/**
 * Full resting chrome inset for Chat Home sub-tab scenes, given the height of
 * the glass header block (wordmark + search dock). The sub-tab bar overlays
 * the scenes directly below the glass block, so scenes reserve
 * glass + sub-tab bar + gap as their list `paddingTop`; on scroll, rows pass
 * behind the blur.
 */
export function chatHomeContentInset(glassBlockHeight: number): number {
  return glassBlockHeight + CHAT_SUB_TAB_BAR_HEIGHT + CHAT_HOME_CONTENT_GAP;
}

/**
 * Resting top inset (see `chatHomeContentInset`) provided by ChatHomeScreen.
 * Defaults to 0 when a scene renders outside Chat Home (e.g. tests).
 */
export const ChatHomeHeaderInsetContext = React.createContext<number>(0);
