import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  ImpersonationBar,
  isImpersonating,
  startImpersonation,
  stopImpersonation,
} from './ImpersonationBar';
import { tokenStorage } from '../tokenStorage';

/**
 * Hành vi biên của phiên xem-thay: khôi phục token admin, từ chối bắt đầu khi
 * không lưu được backup, và tự thoát khi hết hạn. Token không bao giờ hiện trên UI.
 */

const sessionStore = new Map<string, string>();

beforeEach(() => {
  sessionStore.clear();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => (sessionStore.has(key) ? sessionStore.get(key)! : null),
    setItem: (key: string, value: string) => void sessionStore.set(key, String(value)),
    removeItem: (key: string) => void sessionStore.delete(key),
    clear: () => sessionStore.clear(),
  } as Storage);
  tokenStorage.clear();
});

afterEach(() => {
  if (isImpersonating()) stopImpersonation();
  vi.useRealTimers();
  // Không unstub toàn bộ: setup.ts đã stub localStorage (bản jsdom thiếu clear()).
});

const apiClient = (grant: Record<string, unknown>) => ({
  post: vi.fn().mockResolvedValue({ data: grant }),
});

describe('startImpersonation', () => {
  it('cất token admin, thay token bằng token xem-thay, thoát thì khôi phục', async () => {
    tokenStorage.setAccess('admin-token');
    await startImpersonation('user-1', apiClient({
      accessToken: 'readonly-token',
      expiresIn: 300,
      target: { id: 'user-1', displayName: 'Nguyễn An' },
    }));

    expect(tokenStorage.getAccess()).toBe('readonly-token');
    expect(sessionStore.get('admin.impersonation.backup')).toBe('admin-token');
    expect(isImpersonating()).toBe(true);

    stopImpersonation();
    expect(tokenStorage.getAccess()).toBe('admin-token');
    expect(sessionStore.has('admin.impersonation.backup')).toBe(false);
    expect(isImpersonating()).toBe(false);
  });

  it('từ chối bắt đầu khi sessionStorage không ghi được — không đánh đổi mất token admin', async () => {
    tokenStorage.setAccess('admin-token');
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    } as unknown as Storage);

    await expect(
      startImpersonation('user-1', apiClient({ accessToken: 'readonly-token' })),
    ).rejects.toThrow(/không thể bắt đầu/);
    expect(tokenStorage.getAccess()).toBe('admin-token');
    expect(isImpersonating()).toBe(false);
  });

  it('không nhận grant thiếu accessToken', async () => {
    tokenStorage.setAccess('admin-token');
    await expect(startImpersonation('user-1', apiClient({}))).rejects.toThrow(/token xem thay/);
    expect(tokenStorage.getAccess()).toBe('admin-token');
  });

  it('đếm ngược hiện trên bar, không lộ token', async () => {
    tokenStorage.setAccess('admin-token');
    await startImpersonation('user-1', apiClient({
      accessToken: 'readonly-token',
      expiresIn: 300,
      target: { id: 'user-1', displayName: 'Trần Bình' },
    }));

    render(<ImpersonationBar />);
    expect(screen.getByText(/Trần Bình/)).toBeTruthy();
    expect(screen.getByText(/Chỉ đọc/)).toBeTruthy();
    expect(screen.getByText(/05:00/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('readonly-token');
  });
});

describe('hết hạn', () => {
  it('phiên đã quá hạn khi mở lại tab thì khôi phục admin, không hiện bar', async () => {
    tokenStorage.setAccess('admin-token');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    await startImpersonation('user-1', apiClient({
      accessToken: 'readonly-token',
      expiresAt: Date.now() + 60_000,
      target: { id: 'user-1', displayName: 'Lê Chi' },
    }));
    stopImpersonation();
    // Dựng lại đúng trạng thái một tab mở lại: còn backup + state nhưng đã quá hạn.
    sessionStore.set('admin.impersonation.backup', 'admin-token');
    sessionStore.set(
      'admin.impersonation.state',
      JSON.stringify({ target: { id: 'user-1', displayName: 'Lê Chi' }, expiresAt: Date.now() + 1000 }),
    );
    tokenStorage.setAccess('readonly-token');
    vi.setSystemTime(new Date('2026-10-27T10:05:00Z'));
    vi.resetModules();

    const fresh = await import('./ImpersonationBar');
    expect(fresh.isImpersonating()).toBe(false);
    expect(tokenStorage.getAccess()).toBe('admin-token');
    expect(sessionStore.has('admin.impersonation.state')).toBe(false);
  });

  it('bar tự thoát khi đồng hồ chạm 0', async () => {
    tokenStorage.setAccess('admin-token');
    await startImpersonation('user-1', apiClient({
      accessToken: 'readonly-token',
      expiresAt: Date.now() + 1500,
      target: { id: 'user-1', displayName: 'Phạm Dũng' },
    }));
    vi.useFakeTimers();
    render(<ImpersonationBar />);
    expect(screen.getByText(/Phạm Dũng/)).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(isImpersonating()).toBe(false);
    expect(tokenStorage.getAccess()).toBe('admin-token');
    expect(screen.queryByText(/Phạm Dũng/)).toBeNull();
  });
});
