/**
 * Usernames that are reserved and cannot be claimed by users.
 * These prevent impersonation and conflicts with future routing.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'me',
  'admin',
  'support',
  'system',
  'koola',
  'null',
  'undefined',
]);
