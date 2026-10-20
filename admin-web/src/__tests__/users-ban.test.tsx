import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPage from '../pages/UsersPage';
import { ToastProvider } from '../components/Toast';
import apiClient from '../apiClient';

vi.mock('../apiClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const users = {
  data: [
    {
      _id: 'u1',
      displayName: 'Nguyen Van A',
      email: 'a@example.com',
      accountType: 'personal',
      isBanned: false,
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <UsersPage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('UsersPage ban flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users') return Promise.resolve({ data: users });
      if (url === '/admin/users/u1')
        return Promise.resolve({ data: { ...users.data[0], banReason: null, bannedUntil: null } });
      return Promise.resolve({ data: { data: [] } });
    });
  });

  it('ban gửi reason + durationDays, nút disabled khi thiếu reason', async () => {
    mockedPost.mockResolvedValue({ data: {} });
    renderPage();
    expect(await screen.findByText('Nguyen Van A')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cấm' }));
    expect(await screen.findByText('Cấm "Nguyen Van A"')).toBeTruthy();

    // Chưa nhập reason → nút disabled
    expect((screen.getByRole('button', { name: 'Xác nhận cấm' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/lý do cấm/i), { target: { value: 'spam' } });
    fireEvent.change(screen.getByLabelText(/thời hạn/i), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận cấm' }));

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/admin/users/u1/ban', {
        reason: 'spam',
        durationDays: 30,
      }),
    );
  });

  it('drawer có tab lịch sử vi phạm gộp reports + audit', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users') return Promise.resolve({ data: users });
      if (url === '/admin/users/u1') return Promise.resolve({ data: users.data[0] });
      if (url === '/admin/reports')
        return Promise.resolve({
          data: { data: [{ _id: 'r1', targetId: 'u1', targetType: 'user', reason: 'toxic', status: 'pending' }] },
        });
      if (url === '/admin/audit-logs')
        return Promise.resolve({
          data: { data: [{ _id: 'a1', action: 'ban_user', targetType: 'user', targetId: 'u1', payload: { reason: 'spam', durationDays: 7 } }] },
        });
      return Promise.resolve({ data: { data: [] } });
    });
    renderPage();
    expect(await screen.findByText('Nguyen Van A')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Lịch sử vi phạm' }));

    expect(await screen.findByText('Bị báo cáo: toxic')).toBeTruthy();
    expect(screen.getByText('Bị cấm: spam (7 ngày)')).toBeTruthy();
  });
});
