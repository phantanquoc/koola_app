import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportsPage from '../pages/ReportsPage';
import ReportDetailPage from '../pages/ReportDetailPage';
import { ToastProvider } from '../components/Toast';
import apiClient from '../apiClient';

vi.mock('../apiClient', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const listRow = {
  _id: 'r1',
  reporterId: 'u9',
  reporterName: 'Nguyễn Văn A',
  targetType: 'message',
  targetId: 'm1',
  targetName: 'Mua hàng giá rẻ',
  targetDetail: 'Tin nhắn của Người bán',
  reason: 'spam',
  status: 'pending',
  createdAt: new Date().toISOString(),
};

const listResponse = { data: { data: [listRow], total: 1, page: 1, limit: 20 } };

function renderPage(initialPath = '/reports') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <Routes>
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/:id" element={<ReportDetailPage />} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/reports/r1') return Promise.resolve({ data: listRow });
      return Promise.resolve(listResponse);
    });
  });

  it('hiện tên đối tượng bị báo cáo thay vì ObjectId', async () => {
    renderPage();
    // targetName resolve ở server → không còn "m1" trên hàng
    expect(await screen.findByText('Mua hàng giá rẻ')).toBeTruthy();
    expect(screen.getByText(/Tin nhắn của Người bán/)).toBeTruthy();
    expect(screen.getByText('Nguyễn Văn A')).toBeTruthy();
  });

  it('trạng thái hiện nhãn tiếng Việt thay vì enum', async () => {
    renderPage();
    expect(await screen.findByText('Chờ xử lý')).toBeTruthy();
    expect(screen.queryByText('pending')).toBeNull();
  });

  it('bấm Xem điều hướng sang route chi tiết, không mở drawer', async () => {
    renderPage();
    await screen.findByText('Mua hàng giá rẻ');

    fireEvent.click(screen.getByRole('link', { name: /Xem báo cáo spam/ }));

    expect(await screen.findByRole('heading', { name: 'Mua hàng giá rẻ' })).toBeTruthy();
    expect(mockedGet).toHaveBeenCalledWith('/admin/reports/r1');
    // Không còn overlay nào
    expect(document.querySelector('.overlay')).toBeNull();
  });

  it('deep-link trực tiếp vào chi tiết được', async () => {
    renderPage('/reports/r1');
    expect(await screen.findByRole('heading', { name: 'Mua hàng giá rẻ' })).toBeTruthy();
    expect(screen.getByText('spam')).toBeTruthy();
  });

  it('đánh dấu xử lý qua confirm rồi gọi endpoint', async () => {
    mockedPost.mockResolvedValue({ data: {} });
    renderPage('/reports/r1');
    await screen.findByRole('heading', { name: 'Mua hàng giá rẻ' });

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu xử lý' }));
    expect(await screen.findByRole('heading', { name: 'Đánh dấu báo cáo đã xử lý?' })).toBeTruthy();
    // Nút confirm trong dialog (nút đầu tiên cùng tên nằm ở bottom bar)
    const buttons = screen.getAllByRole('button', { name: 'Đánh dấu xử lý' });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/admin/reports/r1/resolve'),
    );
  });

  // Báo cáo đã xử lý không được phép bấm lại — nút hành động biến mất.
  it('báo cáo đã xử lý không còn nút hành động', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/reports/r1')
        return Promise.resolve({ data: { ...listRow, status: 'resolved', resolvedByName: 'Admin B' } });
      return Promise.resolve(listResponse);
    });
    renderPage('/reports/r1');

    await screen.findByRole('heading', { name: 'Mua hàng giá rẻ' });
    expect(screen.queryByRole('button', { name: 'Đánh dấu xử lý' })).toBeNull();
    expect(screen.getByText(/xử lý bởi Admin B/)).toBeTruthy();
  });

  it('lỗi tải hiện StateBlock + Thử lại (không nuốt lỗi)', async () => {
    mockedGet.mockRejectedValueOnce({ response: { data: { message: 'Server sập' } } });
    renderPage('/reports');

    expect(await screen.findByText('Không tải được báo cáo')).toBeTruthy();
    expect(screen.getByText('Server sập')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});
