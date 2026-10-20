import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { useAdminList } from '../hooks/useAdminList';
import { queryClient } from '../queryClient';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/users?status=pending&page=2']}>
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('useUrlFilters', () => {
  it('đọc giá trị từ URL, set cập nhật URL', () => {
    const { result } = renderHook(() => useUrlFilters({ status: '', q: '', page: '1' }), { wrapper });
    expect(result.current.values.status).toBe('pending');
    expect(result.current.values.page).toBe('2');
    act(() => result.current.set({ q: 'abc', page: '1' }));
    expect(result.current.values.q).toBe('abc');
    expect(result.current.values.page).toBe('1');
  });
});

describe('queryClient', () => {
  it('có cấu hình mặc định (không refetch khi focus, retry 1)', () => {
    expect(queryClient.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(1);
  });
});

describe('useAdminList', () => {
  it('export đúng shape', () => {
    expect(typeof useAdminList).toBe('function');
  });
});
