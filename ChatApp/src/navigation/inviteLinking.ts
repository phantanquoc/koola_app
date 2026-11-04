/**
 * inviteLinking.ts
 *
 * The business-invite half of the root deep-link config (task 15.1), kept in
 * its own module — like momentsLinking — so the URL contract can be unit-tested
 * without mounting the navigator tree.
 *
 * `koola://invite?token=<jwt>` → PersonalTab › AcceptInvite
 *
 * The scheme matters: `koola` is what AndroidManifest.xml registers and what
 * React Navigation's `linking.prefixes` lists. The proposal originally wrote
 * `app://invite?token=…`, which nothing claims — those emails produced a link
 * no device could open. The backend now mints `koola://invite` to match
 * (`INVITE_LINK_PREFIX` in business-invites.service.ts); keep the two in sync.
 *
 * `token` arrives as a QUERY param, so React Navigation hands it to the screen
 * as a route param automatically — no `path` placeholder is needed for it.
 */
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export type InviteLinking = Pick<LinkingOptions<RootStackParamList>, 'config'>;

/** Route config fragment, merged into the root linking config. */
export const inviteLinkingScreens = {
  Main: {
    screens: {
      PersonalTab: {
        screens: {
          AcceptInvite: {
            path: 'invite',
            parse: { token: (v: string) => v },
          },
        },
      },
    },
  },
} as const;

/**
 * Pull the invite token out of a `koola://invite?token=…` URL.
 *
 * Used on the unauthenticated path (task 15.3): React Navigation's linking
 * cannot route to AcceptInvite while the auth screen group is mounted, so the
 * token is parked by `pendingInviteStore` and replayed after login. Returns
 * null for any other URL.
 *
 * Hand-parsed rather than via `new URL()`: React Native's URL polyfill does not
 * expose `searchParams` on a custom scheme reliably.
 */
export function parseInviteToken(url: string | null | undefined): string | null {
  if (!url) return null;
  // Accept both the host form (koola://invite?…) and the path form used by
  // notification deep links (koola:///chat/invite?…).
  if (!/^koola:\/\/(?:\/chat\/)?invite\b/i.test(url)) return null;

  const query = url.split('?')[1];
  if (!query) return null;

  for (const pair of query.split('&')) {
    const [rawKey, ...rest] = pair.split('=');
    if (rawKey !== 'token') continue;
    const value = rest.join('=');
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      // A malformed percent-escape is still better handled by the server,
      // which will reject the token, than by dropping the link silently.
      return value;
    }
  }
  return null;
}
