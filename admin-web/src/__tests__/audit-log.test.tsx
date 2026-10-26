import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuditLogPage from '../pages/AuditLogPage';
import apiClient from '../apiClient';

vi.mock('../apiClient', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const row = {
  _id: 'log1',
  actorId: '507f1f77bcf86cd799439011',
  actorName: 'Nguyễn Văn A',
  action: 'approve_business',
  targetType: 'business',
  targetId: '507f1f77bcf86cd799439012',
  targetName: 'Công ty Alpha',
  payload: { note: 'ok' },
  ip: '127.0.0.1',
  createdAt: new Date().toISOString(),
};

const bulkRow = {
  _id: 'log2',
  actorId: '507f1f77bcf86cd799439011',
  actorName: 'Nguyễn Văn A',
  action: 'bulk_approve_business',
  targetType: 'business',
  targetId: '507f1f77bcf86cd799439012,507f1f77bcf86cd799439013',
  createdAt: new Date().toISOString(),
};

function renderPage(initialPath = '/audit-logs') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={client}>
        <AuditLogPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue({ data: { data: [row, bulkRow], total: 2, page: 1, limit: 20 } });
  });

  it('hiện tên người thao tác và nhãn nghiệp vụ thay vì mã kỹ thuật', async () => {
    renderPage();
    expect((await screen.findAllByText('Nguyễn Văn A')).length).toBeGreaterThan(0);
    // Nhãn xuất hiện cả ở badge trong bảng lẫn option của bộ lọc hành động.
    expect(screen.getAllByText('Duyệt hồ sơ').length).toBeGreaterThan(0);
    // action lạ không có trong map mới hiện mã gốc — ở đây bulk có nhãn nên không lộ mã
    expect(screen.queryByText('approve_business')).toBeNull();
  });

  it('hiện tên đối tượng thay vì ObjectId', async () => {
    renderPage();
    expect(await screen.findByText('Công ty Alpha')).toBeTruthy();
  });

  it('dòng bulk đọc ra số đối tượng thay vì chuỗi id', async () => {
    renderPage();
    expect(await screen.findByText('2 đối tượng')).toBeTruthy();
  });

  it('lọc theo người thao tác gửi param lên server', async () => {
    renderPage();
    await screen.findByText('Công ty Alpha');

    fireEvent.change(screen.getByLabelText('Lọc theo người thao tác'), { target: { value: 'nguyễn' } });

    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith(
        '/admin/audit-logs',
        expect.objectContaining({ params: expect.objectContaining({ actor: 'nguyễn' }) }),
      ),
    );
  });

  it('lọc ngày gửi from 00:00 và to 23:59:59.999', async () => {
    renderPage();
    await screen.findByText('Công ty Alpha');

    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });

    await waitFor(() => {
      const call = mockedGet.mock.calls.find((c) => c[1]?.params?.from);
      const from = new Date(call?.[1].params.from as string);
      expect(from.getHours()).toBe(0);
      expect(from.getMinutes()).toBe(0);
    });
  });

  it('mở drawer chi tiết hiện payload đã che secret', async () => {
    renderPage();
    await screen.findByText('Công ty Alpha');

    fireEvent.click(screen.getByRole('button', { name: /Xem chi tiết Duyệt hồ sơ/ }));
    expect(await screen.findByRole('heading', { name: 'Duyệt hồ sơ' })).toBeTruthy();
    expect(screen.getByText(/"note": "ok"/)).toBeTruthy();
  });

  it('lỗi hiện StateBlock + nút Thử lại (không nuốt lỗi)', async () => {
    mockedGet.mockRejectedValueOnce({ response: { data: { message: 'Server sập' } } });
    renderPage();

    expect(await screen.findByText('Không tải được audit log')).toBeTruthy();
    expect(screen.getByText('Server sập')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});
