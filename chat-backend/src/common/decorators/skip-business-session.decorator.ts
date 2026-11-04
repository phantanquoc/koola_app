import { SetMetadata } from '@nestjs/common';

export const SKIP_BUSINESS_SESSION_KEY = 'skipBusinessSessionCheck';

/**
 * Exempt a route from `BusinessSessionGuard`.
 *
 * Needed by the routes that CLAIM or RELEASE a session, because the guard
 * compares the caller's device against the session row that is about to be
 * replaced:
 *  - `POST /accounts/switch` — the new device's first call; the row still
 *    names the old device, so the guard would reject the very login that is
 *    meant to take over.
 *  - `POST /auth/logout` — releases the row; a device that was already evicted
 *    must still be able to log out cleanly.
 */
export const SkipBusinessSessionCheck = () =>
  SetMetadata(SKIP_BUSINESS_SESSION_KEY, true);
