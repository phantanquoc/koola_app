import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuditLogPage from '../pages/AuditLogPage';
import AuditLogDetailPage from '../pages/AuditLogDetailPage';
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
  targetName: 'Công ty Alpha, Công ty Beta',
  targetItems: [
    { id: '507f1f77bcf86cd799439012', name: 'Công ty Alpha' },
    { id: '507f1f77bcf86cd799439013', name: 'Công ty Beta' },
  ],
  createdAt: new Date().toISOString(),
};

function renderPage(initialPath = '/audit-logs') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/audit-logs" element={<AuditLogPage />} />
          <Route path="/audit-logs/:id" element={<AuditLogDetailPage />} />
        </Routes>
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
    // Số lượng và tên là hai text node cạnh nhau trong cùng ô → matcher theo
    // textContent của ô, không phải getByText khớp cả chuỗi.
    expect(await screen.findByText((_, el) =>
      el?.className === 'cell-meta' && el.textContent?.startsWith('2 đối tượng') === true,
    )).toBeTruthy();
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

  // Chi tiết là ROUTE riêng, không phải drawer/overlay: deep-link được và
  // không che danh sách.
  it('bấm chi tiết điều hướng sang route /audit-logs/:id', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/audit-logs/log1') return Promise.resolve({ data: row });
      return Promise.resolve({ data: { data: [row, bulkRow], total: 2, page: 1, limit: 20 } });
    });
    renderPage();
    await screen.findByText('Công ty Alpha');

    fireEvent.click(screen.getByRole('button', { name: /Xem chi tiết Duyệt hồ sơ/ }));

    expect(await screen.findByRole('heading', { name: 'Duyệt hồ sơ' })).toBeTruthy();
    // Dữ liệu lấy từ endpoint chi tiết, không lọc lại từ list
    expect(mockedGet).toHaveBeenCalledWith('/admin/audit-logs/log1');
    expect(screen.getByText(/"note": "ok"/)).toBeTruthy();
    // Không còn overlay/modal nào bọc ngoài
    expect(document.querySelector('.overlay')).toBeNull();
    expect(screen.getByRole('link', { name: /Về danh sách/ })).toBeTruthy();
  });

  it('mở thẳng link chi tiết được (deep-link)', async () => {
    mockedGet.mockResolvedValue({ data: row });
    renderPage('/audit-logs/log1');

    expect(await screen.findByRole('heading', { name: 'Duyệt hồ sơ' })).toBeTruthy();
    expect(mockedGet).toHaveBeenCalledWith('/admin/audit-logs/log1');
  });

  it('dòng bulk liệt kê từng đối tượng theo tên, mã nằm ở phần kỹ thuật', async () => {
    mockedGet.mockResolvedValue({ data: bulkRow });
    renderPage('/audit-logs/log2');

    expect(await screen.findByText(/2 đối tượng trong một lần/)).toBeTruthy();
    // `targetItems` có tên → hiện tên, không bắt moderator đọc ObjectId
    expect(screen.getByText('Công ty Alpha')).toBeTruthy();
    expect(screen.getByText('Công ty Beta')).toBeTruthy();
  });

  it('dịch key payload sang tiếng Việt thay vì hiện JSON thô', async () => {
    mockedGet.mockResolvedValue({
      data: {
        ...row,
        action: 'update_business',
        payload: { displayName: 'Công ty Mới', businessCategory: 'retail' },
      },
    });
    renderPage('/audit-logs/log1');

    expect(await screen.findByText('Nội dung thay đổi')).toBeTruthy();
    expect(screen.getByText('Tên doanh nghiệp')).toBeTruthy();
    expect(screen.getByText('Công ty Mới')).toBeTruthy();
    // Danh mục slug được dịch, không hiện "retail"
    expect(screen.getByText('Bán lẻ')).toBeTruthy();
    expect(screen.queryByText('retail')).toBeNull();
  });

  it('che email/số điện thoại trong payload', async () => {
    mockedGet.mockResolvedValue({
      data: { ...row, payload: { contactEmail: 'alpha@example.com', contactPhone: '0901111111' } },
    });
    renderPage('/audit-logs/log1');

    expect(await screen.findByText('Email liên hệ')).toBeTruthy();
    // MaskedPII che mặc định — email/PII không lộ trần trong audit log
    expect(screen.queryByText('alpha@example.com')).toBeNull();
    expect(screen.queryByText('0901111111')).toBeNull();
  });

  it('ẩn IP nội bộ (dev/docker) khỏi phần đọc chính, chỉ giữ ở chi tiết kỹ thuật', async () => {
    mockedGet.mockResolvedValue({ data: { ...row, ip: '::ffff:192.168.65.1' } });
    renderPage('/audit-logs/log1');

    await screen.findByRole('heading', { name: 'Duyệt hồ sơ' });
    // Không có dòng "IP truy cập" — moderator không cần đọc địa chỉ máy dev
    expect(screen.queryByText('IP truy cập')).toBeNull();
    // Nhưng giá trị thô vẫn còn trong <details> để đối soát kỹ thuật
    expect(screen.getByText('Chi tiết kỹ thuật')).toBeTruthy();
    expect(screen.getByText(/192\.168\.65\.1/)).toBeTruthy();
  });

  it('hiện IP public ở dạng đọc được', async () => {
    mockedGet.mockResolvedValue({ data: { ...row, ip: '::ffff:203.0.113.7' } });
    renderPage('/audit-logs/log1');

    expect(await screen.findByText('IP truy cập')).toBeTruthy();
    expect(screen.getByText('203.0.113.7')).toBeTruthy();
  });

  it('lỗi hiện StateBlock + nút Thử lại (không nuốt lỗi)', async () => {
    mockedGet.mockRejectedValueOnce({ response: { data: { message: 'Server sập' } } });
    renderPage();

    expect(await screen.findByText('Không tải được audit log')).toBeTruthy();
    expect(screen.getByText('Server sập')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});
