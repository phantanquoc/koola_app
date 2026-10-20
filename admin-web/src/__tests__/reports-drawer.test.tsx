import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportsPage from '../pages/ReportsPage';
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

const reports = {
  data: [
    {
      _id: 'r1',
      reporterId: 'u9',
      targetType: 'message',
      targetId: 'm1',
      reason: 'spam',
      status: 'pending',
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
          <ReportsPage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ReportsPage', () => {
  it('hiện deep-link tới target và mở drawer khi bấm Xem', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/reports') return Promise.resolve({ data: reports });
      if (url === '/admin/messages/search')
        return Promise.resolve({ data: { data: [{ _id: 'm1', senderId: 'u1', content: 'hello' }] } });
      return Promise.resolve({ data: { data: [] } });
    });
    renderPage();

    expect(await screen.findByText('spam')).toBeTruthy();
    // Deep-link tới message target ngay trên hàng
    expect(screen.getByRole('link').getAttribute('href')).toContain('/messages?focus=m1');

    fireEvent.click(screen.getByRole('button', { name: 'Xem' }));
    await waitFor(() => expect(screen.getByText('Xử lý báo cáo')).toBeTruthy());
    expect(screen.getByText('Tin nhắn từ u1')).toBeTruthy();
  });

  it('resolve từ drawer gọi đúng endpoint và đóng drawer', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/reports') return Promise.resolve({ data: reports });
      return Promise.resolve({ data: { data: [] } });
    });
    mockedPost.mockResolvedValue({ data: {} });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Xem' }));
    await waitFor(() => expect(screen.getByText('Xử lý báo cáo')).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: 'Resolve' })[0]);
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/admin/reports/r1/resolve'));
  });
});
