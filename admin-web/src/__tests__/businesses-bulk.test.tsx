import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BusinessesPage from '../pages/BusinessesPage';
import BusinessDetailPage from '../pages/BusinessDetailPage';
import { ToastProvider } from '../components/Toast';
import { AuthProvider } from '../AuthContext';
import apiClient from '../apiClient';

vi.mock('../apiClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockedDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

const bizList = {
  data: [
    {
      _id: 'b1',
      displayName: 'Công ty Alpha',
      email: 'alpha@example.com',
      contactPhone: '0901111111',
      businessCategory: 'F&B',
      province: 'Hà Nội',
      verificationStatus: 'pending',
      createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    },
    {
      _id: 'b2',
      displayName: 'Công ty Beta',
      email: 'beta@example.com',
      verificationStatus: 'pending',
      createdAt: new Date(Date.now() - 100 * 3_600_000).toISOString(),
    },
  ],
  total: 2,
  page: 1,
  limit: 20,
};

const bizDetail = {
  _id: 'b1',
  displayName: 'Công ty Alpha',
  email: 'alpha@example.com',
  verificationStatus: 'pending',
  businessCategory: 'F&B',
  province: 'Hà Nội',
  createdAt: new Date().toISOString(),
  licenseImageUrl: null,
};

function renderPage(initialPath = '/businesses') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/businesses" element={<BusinessesPage />} />
              <Route path="/businesses/:id" element={<BusinessDetailPage />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('BusinessesPage quản lý doanh nghiệp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/me') return Promise.resolve({ data: { name: 'Tester', email: 't@koola.app' } });
      if (url === '/admin/businesses/b1') return Promise.resolve({ data: bizDetail });
      return Promise.resolve({ data: bizList });
    });
  });

  it('hiển thị tabs 3 trạng thái, mặc định tab Chờ duyệt', async () => {
    renderPage();
    expect(await screen.findByText('Công ty Alpha')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Chờ duyệt' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Đã duyệt' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Bị từ chối' })).toBeTruthy();
  });

  it('chuyển tab gửi status lên server', async () => {
    renderPage();
    expect(await screen.findByText('Công ty Alpha')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Đã duyệt' }));
    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith(
        '/admin/businesses/pending',
        expect.objectContaining({ params: expect.objectContaining({ status: 'verified' }) }),
      ),
    );
  });

  it('search debounce gửi lên server qua params', async () => {
    renderPage();
    expect(await screen.findByText('Công ty Alpha')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/Tên, email/), {
      target: { value: 'alpha' },
    });

    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith(
        '/admin/businesses/pending',
        expect.objectContaining({ params: expect.objectContaining({ search: 'alpha' }) }),
      ),
      { timeout: 2000 },
    );
  });

  it('chọn checkbox hiện BulkBar, bulk approve qua type-to-confirm', async () => {
    mockedPost.mockResolvedValue({ data: { approved: 2, failed: [] } });
    renderPage();
    expect(await screen.findByText('Công ty Alpha')).toBeTruthy();

    expect(screen.queryByRole('toolbar', { name: 'Thao tác hàng loạt' })).toBeNull();

    fireEvent.click(screen.getByLabelText('Chọn Công ty Alpha'));
    fireEvent.click(screen.getByLabelText('Chọn Công ty Beta'));
    expect(screen.getByRole('toolbar', { name: 'Thao tác hàng loạt' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Duyệt hàng loạt' }));
    expect(await screen.findByText('Duyệt 2 doanh nghiệp?')).toBeTruthy();

    const dialogBtns = screen.getByRole('dialog').querySelectorAll('button');
    const dialogConfirm = Array.from(dialogBtns).find((b) => b.textContent === 'Duyệt hàng loạt') as HTMLButtonElement;
    expect(dialogConfirm.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Gõ/), { target: { value: 'XACNHAN' } });
    fireEvent.click(dialogConfirm);

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/admin/businesses/bulk-approve', {
        ids: ['b1', 'b2'],
      }),
    );
  });

  it('duyệt lẻ dùng ConfirmDialog có preview', async () => {
    mockedPost.mockResolvedValue({ data: {} });
    renderPage();
    expect(await screen.findByText('Công ty Alpha')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Duyệt Công ty Alpha' }));
    expect(await screen.findByRole('heading', { name: 'Xác nhận duyệt' })).toBeTruthy();
    expect(screen.getAllByText('alpha@example.com').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận duyệt' }));
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/admin/businesses/b1/approve'),
    );
  });

  it('từ chối bulk yêu cầu reason, gọi bulk-reject', async () => {
    mockedPost.mockResolvedValue({ data: { approved: 2, failed: [] } });
    renderPage();
    expect(await screen.findByText('Công ty Alpha')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Chọn Công ty Alpha'));
    fireEvent.click(screen.getByLabelText('Chọn Công ty Beta'));
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối hàng loạt' }));

    expect(await screen.findByText('Từ chối 2 doanh nghiệp')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }));
    expect(await screen.findByText('Vui lòng nhập lý do từ chối.')).toBeTruthy();
    expect(mockedPost).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Nhập lý do từ chối'), {
      target: { value: 'Giấy phép mờ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }));

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/admin/businesses/bulk-reject', {
        ids: ['b1', 'b2'],
        rejectionReason: 'Giấy phép mờ',
      }),
    );
  });

  it('nút Xem mở modal chi tiết giữa màn hình', async () => {
    renderPage();
    expect(await screen.findByText('Công ty Alpha')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Xem Công ty Alpha' }));
    // modal giữa màn hình, backdrop mờ (role dialog)
    expect(await screen.findByRole('heading', { name: 'Hồ sơ doanh nghiệp' })).toBeTruthy();
    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith('/admin/businesses/b1'),
    );
  });

  it('route chi tiết deep-link trực tiếp được', async () => {
    renderPage('/businesses/b1');
    expect(await screen.findByRole('heading', { name: 'Hồ sơ doanh nghiệp' })).toBeTruthy();
    // inline-edit: bút sửa hiện ở từng dòng
    expect(await screen.findByRole('button', { name: 'Sửa Tên doanh nghiệp' })).toBeTruthy();
  });

  it('duyệt xong toast có nút Hoàn tác gọi reopen', async () => {
    mockedPost.mockResolvedValue({ data: {} });
    renderPage();
    expect(await screen.findByText('Công ty Alpha')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Duyệt Công ty Alpha' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận duyệt' }));

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/admin/businesses/b1/approve'),
    );
    expect(await screen.findByRole('button', { name: 'Hoàn tác' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/admin/businesses/b1/reopen'),
    );
  });

  it('nút Xóa gọi soft-delete qua confirm', async () => {
    mockedDelete.mockResolvedValue({ data: {} });
    renderPage();
    expect(await screen.findByText('Công ty Alpha')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa Công ty Alpha' }));
    expect(await screen.findByRole('heading', { name: 'Xóa hồ sơ doanh nghiệp?' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa hồ sơ' }));
    await waitFor(() =>
      expect(mockedDelete).toHaveBeenCalledWith('/admin/businesses/b1'),
    );
  });
});
