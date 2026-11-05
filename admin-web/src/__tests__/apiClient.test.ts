/**
 * apiClient tests: 401 silent-refresh + retry once, refresh failure → logout,
 * 403 keeps session (redirects to /forbidden, never /login loop),
 * 429 → rate-limit event + temporary flag.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import type { AxiosAdapter, AxiosResponse } from 'axios';
import apiClient, { onRateLimited, isRateLimited } from '../apiClient';
import { tokenStorage } from '../tokenStorage';

function okResponse(data: unknown, configUrl = '/admin/health'): AxiosResponse {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { url: configUrl, headers: {} } as never,
  };
}

function errorWithStatus(status: number, url = '/admin/health') {
  const err = new axios.AxiosError('Request failed');
  err.response = { status, data: {}, statusText: '', headers: {}, config: {} as never };
  err.config = { url, headers: {} } as never;
  return err;
}

describe('apiClient', () => {
  // Minimal spy surface used below; avoids axios overloaded-method generics.
  let postSpy: {
    mockResolvedValueOnce: (v: unknown) => void;
    mockRejectedValueOnce: (e: unknown) => void;
    mockRestore: () => void;
    mock: { calls: unknown[][] };
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    postSpy = vi.spyOn(axios, 'post');
  });

  afterEach(() => {
    postSpy?.mockRestore();    apiClient.defaults.adapter = undefined as never;
  });

  it('401 → silent refresh rotates both tokens and retries the request once', async () => {
    tokenStorage.setAccess('expired-access');
    tokenStorage.setRefresh('valid-refresh');
    postSpy.mockResolvedValueOnce({ data: { accessToken: 'new-access', refreshToken: 'new-refresh' } });

    let calls = 0;
    const seenAuth: Array<string | undefined> = [];
    apiClient.defaults.adapter = (async (cfg) => {
      calls += 1;
      seenAuth.push(cfg.headers?.Authorization as string | undefined);
      if (calls === 1) throw errorWithStatus(401);
      return okResponse({ ok: true });
    }) as AxiosAdapter;

    const res = await apiClient.get('/admin/health');
    expect(res.data).toEqual({ ok: true });
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy.mock.calls[0]?.[1]).toEqual({ refreshToken: 'valid-refresh' });
    expect(tokenStorage.getAccess()).toBe('new-access');
    expect(tokenStorage.getRefresh()).toBe('new-refresh');
    expect(seenAuth[1]).toBe('Bearer new-access');
  });

  it('401 with dead refresh token → clears session (re-auth needed)', async () => {
    tokenStorage.setAccess('expired-access');
    tokenStorage.setRefresh('dead-refresh');
    postSpy.mockRejectedValueOnce(errorWithStatus(401, '/auth/refresh'));

    apiClient.defaults.adapter = (async () => {
      throw errorWithStatus(401);
    }) as AxiosAdapter;

    await expect(apiClient.get('/admin/health')).rejects.toThrow();
    expect(tokenStorage.getAccess()).toBeNull();
    expect(tokenStorage.getRefresh()).toBeNull();
  });

  it('403 → keeps session (demote screen, never a /login loop)', async () => {
    tokenStorage.setAccess('valid-access');
    tokenStorage.setRefresh('valid-refresh');
    apiClient.defaults.adapter = (async () => {
      throw errorWithStatus(403);
    }) as AxiosAdapter;

    await expect(apiClient.get('/admin/health')).rejects.toThrow();
    // Session survives: ForbiddenPage offers dashboard-back + explicit sign-out.
    expect(tokenStorage.getAccess()).toBe('valid-access');
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('429 → notifies listeners and sets the temporary flag', async () => {
    const seen: string[] = [];
    const off = onRateLimited(() => seen.push('hit'));
    apiClient.defaults.adapter = (async () => {
      throw errorWithStatus(429);
    }) as AxiosAdapter;

    await expect(apiClient.get('/admin/health')).rejects.toThrow();
    expect(seen).toHaveLength(1);
    expect(isRateLimited()).toBe(true);
    off();
  });

  it('concurrent 401s share a single refresh call (single-flight)', async () => {
    tokenStorage.setAccess('expired-access');
    tokenStorage.setRefresh('valid-refresh');
    postSpy.mockResolvedValueOnce({ data: { accessToken: 'new-access', refreshToken: 'new-refresh' } });

    apiClient.defaults.adapter = (async (cfg) => {
      if ((cfg.headers?.Authorization as string) === 'Bearer expired-access') {
        throw errorWithStatus(401);
      }
      return okResponse({ ok: true });
    }) as AxiosAdapter;

    const [a, b] = await Promise.all([apiClient.get('/a'), apiClient.get('/b')]);
    expect(a.data).toEqual({ ok: true });
    expect(b.data).toEqual({ ok: true });
    expect(postSpy).toHaveBeenCalledTimes(1);
  });
});
