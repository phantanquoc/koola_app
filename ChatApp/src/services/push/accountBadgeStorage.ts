/**
 * Per-account notification badge storage.
 *
 * Tracks which owned accounts have unread push notifications on this device.
 * Keyed by accountId, persisted to AsyncStorage.
 *
 * Write path:  push arrives for a non-active account → markAccountBadge(accountId)
 * Clear path:  account becomes active (switch) / screen mounts → clearAccountBadge(accountId)
 * Read path:   AccountListScreen → getAccountBadges()
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const BADGE_KEY = '@account_badges';

/**
 * Returns the current set of accountIds that have pending notifications.
 */
export async function getAccountBadges(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(BADGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

/**
 * Marks accountId as having a pending notification badge.
 * No-op if already set.
 */
export async function markAccountBadge(accountId: string): Promise<void> {
  try {
    const current = await getAccountBadges();
    if (current.has(accountId)) return;
    current.add(accountId);
    await AsyncStorage.setItem(BADGE_KEY, JSON.stringify([...current]));
  } catch (err) {
    console.error('[AccountBadge] Failed to mark badge:', err);
  }
}

/**
 * Clears the badge for accountId (called when the account becomes active).
 */
export async function clearAccountBadge(accountId: string): Promise<void> {
  try {
    const current = await getAccountBadges();
    if (!current.has(accountId)) return;
    current.delete(accountId);
    await AsyncStorage.setItem(BADGE_KEY, JSON.stringify([...current]));
  } catch (err) {
    console.error('[AccountBadge] Failed to clear badge:', err);
  }
}
