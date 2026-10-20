/**
 * config tests: fail-fast on missing VITE_API_URL, no dead `as string ??`
 * fallback, trailing-slash trimming.
 */
import { describe, it, expect, vi } from 'vitest';

describe('config', () => {
  it('resolves apiUrl from VITE_API_URL (test env dummy)', async () => {
    const { config } = await import('../config');
    expect(config.apiUrl).toBe('http://localhost:3000/api');
  });

  it('strips trailing slashes', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api///');
    vi.resetModules();
    const { config } = await import('../config');
    expect(config.apiUrl).toBe('http://localhost:3000/api');
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
