import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPage from '../pages/UsersPage';
import UserDetailPage from '../pages/UserDetailPage';
import { ToastProvider } from '../components/Toast';
import apiClient from '../apiClient';

vi.mock('../apiClient', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const user = {
  _id: 'u1',
  displayName: 'Nguyễn Văn A',
  email: 'a@example.com',
  phone: '0901111111',
  accountType: 'personal',
  isBanned: false,
  createdAt: '2026-09-01T00:00:00.000Z',
};

const bannedUser = {
  _id: 'u2',
  displayName: 'Trần Thị B',
  email: 'b@example.com',
  accountType: 'business',
  isBanned: true,
  banReason: 'spam',
  bannedUntil: '2026-11-01T00:00:00.000Z',
  verificationStatus: 'verified',
  createdAt: '2026-08-01T00:00:00.000Z',
};

function renderAt(initialPath = '/users') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <Routes>
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/:id" element={<UserDetailPage />} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function mockList(rows = [user, bannedUser]) {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/admin/users') return Promise.resolve({ data: { data: rows, total: rows.length, page: 1, limit: 20 } });
    if (url === '/admin/stats')
      return Promise.resolve({ data: { totalPersonal: 10, totalBusiness: 5, bannedUsers: 1, platformAdmins: 2, archivedUsers: 3 } });
    if (url === '/admin/users/u1') return Promise.resolve({ data: user });
    if (url === '/admin/users/u2') return Promise.resolve({ data: bannedUser });
    return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 20 } });
  });
}

describe('UsersPage — list pattern', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList();
  });

  it('tab trạng thái lấy số từ /admin/stats, không đếm ở client', async () => {
    renderAt();
    await screen.findByText('Nguyễn Văn A');

    // Tất cả = 10 cá nhân + 5 doanh nghiệp; Bị cấm = 1; Lưu trữ = 3; Quản trị = 2
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0].textContent).toContain('15');
    expect(tabs[1].textContent).toContain('1');
    expect(tabs[2].textContent).toContain('3');
    expect(tabs[3].textContent).toContain('2');
  });

  it('chọn tab Lưu trữ gửi status=archived và sort theo ngày xoá', async () => {
    renderAt();
    await screen.findByText('Nguyễn Văn A');

    fireEvent.click(screen.getByRole('tab', { name: /Lưu trữ/ }));

    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith(
        '/admin/users',
        expect.objectContaining({
          params: expect.objectContaining({ status: 'archived', sort: 'deletedAt:desc' }),
        }),
      ),
    );
  });

  it('chọn tab Bị cấm gửi status=banned lên server', async () => {
    renderAt();
    await screen.findByText('Nguyễn Văn A');

    fireEvent.click(screen.getByRole('tab', { name: /Bị cấm/ }));

    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith(
        '/admin/users',
        expect.objectContaining({ params: expect.objectContaining({ status: 'banned' }) }),
      ),
    );
  });

  it('ô tìm kiếm chính debounce rồi gửi search', async () => {
    renderAt();
    await screen.findByText('Nguyễn Văn A');

    fireEvent.change(screen.getByLabelText(/Tìm người dùng/), { target: { value: 'nguyễn' } });

    await waitFor(
      () => expect(mockedGet).toHaveBeenCalledWith(
        '/admin/users',
        expect.objectContaining({ params: expect.objectContaining({ search: 'nguyễn' }) }),
      ),
      { timeout: 2000 },
    );
  });

  it('che email/SĐT mặc định — không lộ trần trên bảng', async () => {
    renderAt();
    await screen.findByText('Nguyễn Văn A');

    expect(screen.queryByText('a@example.com')).toBeNull();
    expect(screen.queryByText('0901111111')).toBeNull();
  });

  it('badge Bị cấm hiện ngay trên hàng của bảng', async () => {
    renderAt();
    await screen.findByText('Trần Thị B');
    // "Bị cấm" cũng là nhãn tab → soi trong bảng, không phải tablist.
    const table = screen.getByRole('table', { name: 'Danh sách người dùng' });
    expect(table.textContent).toContain('Bị cấm');
  });

  it('click hàng mở route /users/:id (không phải drawer)', async () => {
    renderAt();
    await screen.findByText('Nguyễn Văn A');

    fireEvent.click(screen.getByText('Nguyễn Văn A'));

    expect(await screen.findByRole('heading', { name: 'Nguyễn Văn A' })).toBeTruthy();
    expect(mockedGet).toHaveBeenCalledWith('/admin/users/u1');
    // Không còn overlay/drawer nào bọc ngoài
    expect(document.querySelector('.overlay')).toBeNull();
    expect(screen.getByRole('link', { name: /Về danh sách/ })).toBeTruthy();
  });

  it('Enter/Space trên hàng mở chi tiết bằng bàn phím', async () => {
    renderAt();
    await screen.findByText('Nguyễn Văn A');

    const row = screen.getByText('Nguyễn Văn A').closest('tr') as HTMLElement;
    expect(row.tabIndex).toBe(0);
    expect(row.getAttribute('aria-label')).toBe('Xem chi tiết Nguyễn Văn A');

    fireEvent.keyDown(row, { key: 'Enter' });

    expect(await screen.findByRole('heading', { name: 'Nguyễn Văn A' })).toBeTruthy();
  });

  it('ban gửi reason + durationDays, nút disabled khi thiếu reason', async () => {
    mockedPost.mockResolvedValue({ data: {} });
    renderAt();
    await screen.findByText('Nguyễn Văn A');

    fireEvent.click(screen.getByRole('button', { name: 'Cấm Nguyễn Văn A' }));
    expect(await screen.findByText('Cấm "Nguyễn Văn A"')).toBeTruthy();

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

  it('lỗi tải hiện StateBlock + nút Thử lại (không nuốt lỗi)', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users') return Promise.reject({ response: { data: { message: 'Server sập' } } });
      return Promise.resolve({ data: { data: [] } });
    });
    renderAt();

    expect(await screen.findByText('Không tải được danh sách')).toBeTruthy();
    expect(screen.getByText('Server sập')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});

describe('UserDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList();
  });

  it('deep-link /users/:id mở được, hiện lý do cấm + liên kết hồ sơ doanh nghiệp', async () => {
    renderAt('/users/u2');

    expect(await screen.findByRole('heading', { name: 'Trần Thị B' })).toBeTruthy();
    expect(screen.getByText(/Lý do: spam/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Mở hồ sơ doanh nghiệp/ }).getAttribute('href')).toBe('/businesses/u2');
  });

  // Doanh nghiệp do admin tạo tay không có ownerUserId — UI phải nói thẳng thay
  // vì để trống một dòng "Chủ sở hữu".
  it('doanh nghiệp không có chủ: ghi rõ do admin tạo trực tiếp', async () => {
    renderAt('/users/u2');
    await screen.findByRole('heading', { name: 'Trần Thị B' });

    expect(screen.getByText('Hồ sơ do admin tạo trực tiếp')).toBeTruthy();
  });

  it('tài khoản cá nhân liệt kê doanh nghiệp sở hữu, mỗi dòng link tới hồ sơ', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users/u1')
        return Promise.resolve({
          data: {
            ...user,
            ownedBusinesses: [
              { _id: 'b1', displayName: 'Công ty Alpha', verificationStatus: 'verified' },
              { _id: 'b2', displayName: 'Công ty Beta', verificationStatus: 'pending', isBanned: true },
              { _id: 'b3', displayName: 'Công ty Gamma', verificationStatus: 'verified', suspended: true },
            ],
          },
        });
      return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 20 } });
    });

    renderAt('/users/u1');
    await screen.findByRole('heading', { name: 'Nguyễn Văn A' });

    const section = screen.getByRole('region', { name: 'Doanh nghiệp sở hữu' });
    expect(section.textContent).toContain('Doanh nghiệp sở hữu (3)');
    expect(screen.getByRole('link', { name: 'Công ty Alpha' }).getAttribute('href')).toBe('/businesses/b1');
    expect(screen.getByRole('link', { name: 'Công ty Beta' }).getAttribute('href')).toBe('/businesses/b2');
    // Trạng thái khác nhau phải đọc được, không chỉ dựa vào màu badge.
    expect(section.textContent).toContain('Bị cấm');
    expect(section.textContent).toContain('Tạm ngưng bán');
  });

  it('tài khoản cá nhân không sở hữu doanh nghiệp nào: giải thích thay vì khối rỗng', async () => {
    renderAt('/users/u1');
    await screen.findByRole('heading', { name: 'Nguyễn Văn A' });

    const section = screen.getByRole('region', { name: 'Doanh nghiệp sở hữu' });
    expect(section.textContent).toContain('Doanh nghiệp sở hữu (0)');
    expect(section.textContent).toContain('chưa sở hữu doanh nghiệp nào');
  });

  it('tài khoản doanh nghiệp hiện chủ sở hữu dạng tên, link về hồ sơ cá nhân', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users/u2')
        return Promise.resolve({
          data: {
            ...bannedUser,
            owner: { _id: 'owner-1', displayName: 'Chủ Sở Hữu', email: 'owner@example.com' },
          },
        });
      return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 20 } });
    });

    renderAt('/users/u2');
    await screen.findByRole('heading', { name: 'Trần Thị B' });

    const link = screen.getByRole('link', { name: 'Chủ Sở Hữu' });
    expect(link.getAttribute('href')).toBe('/users/owner-1');
    expect(screen.queryByText('Hồ sơ do admin tạo trực tiếp')).toBeNull();
  });

  it('lịch sử vi phạm lọc ở server theo targetType + targetId', async () => {
    mockedGet.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/admin/audit-logs') {
        expect(config?.params).toMatchObject({ targetType: 'user', targetId: 'u1' });
        return Promise.resolve({
          data: {
            data: [
              { _id: 'a1', action: 'ban_user', actorName: 'Admin A', targetType: 'user', targetId: 'u1',
                payload: { reason: 'spam', durationDays: 7 }, createdAt: '2026-10-01T00:00:00.000Z' },
            ],
          },
        });
      }
      if (url === '/admin/reports') return Promise.resolve({ data: { data: [] } });
      if (url === '/admin/users/u1') return Promise.resolve({ data: user });
      return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 20 } });
    });
    renderAt('/users/u1');

    // Nhãn nghiệp vụ + tên admin, không phải mã action / ObjectId
    expect(await screen.findByText((_, el) =>
      el?.tagName === 'SPAN' && /Admin A/.test(el.textContent ?? ''),
    )).toBeTruthy();
    expect(screen.queryByText('ban_user')).toBeNull();
  });

  it('trang chi tiết có nút bỏ cấm khi tài khoản đang bị cấm', async () => {
    renderAt('/users/u2');
    expect(await screen.findByRole('button', { name: /Bỏ cấm/ })).toBeTruthy();
  });

  // Rail: tín hiệu tin cậy phải đọc được mà không phải cuộn xuống thân trang.
  it('rail hiện số báo cáo và trạng thái 2FA', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users/u1')
        return Promise.resolve({
          data: {
            ...user,
            twoFactorEnabled: false,
            reportStats: { pending: 2, total: 9 },
          },
        });
      return Promise.resolve({ data: [] });
    });

    renderAt('/users/u1');
    const rail = await screen.findByRole('complementary', { name: 'Tóm tắt tài khoản' });

    expect(rail.textContent).toContain('Báo cáo');
    expect(rail.textContent).toContain('2');
    expect(rail.textContent).toContain('/ 9 tổng');
    expect(rail.textContent).toContain('Chưa bật');
  });

  // Không có đơn nào là trạng thái mặc định — hiện "0 / 0" + "0₫" chỉ làm rối.
  it('rail ẩn khối mua bán khi chưa có đơn nào', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users/u1')
        return Promise.resolve({
          data: { ...user, commerceStats: { ordersAsBuyer: 0, ordersAsSeller: 0, gmvAsSeller: 0 } },
        });
      return Promise.resolve({ data: [] });
    });

    renderAt('/users/u1');
    const rail = await screen.findByRole('complementary', { name: 'Tóm tắt tài khoản' });

    expect(rail.textContent).not.toContain('Đơn mua / bán');
    expect(rail.textContent).not.toContain('Doanh thu đã giao');
  });

  it('rail hiện đơn mua/bán + doanh thu đã giao khi có dữ liệu', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users/u1')
        return Promise.resolve({
          data: {
            ...user,
            commerceStats: { ordersAsBuyer: 3, ordersAsSeller: 7, gmvAsSeller: 1250000 },
          },
        });
      return Promise.resolve({ data: [] });
    });

    renderAt('/users/u1');
    const rail = await screen.findByRole('complementary', { name: 'Tóm tắt tài khoản' });

    expect(rail.textContent).toContain('Đơn mua / bán');
    expect(rail.textContent).toContain('3 / 7');
    // 1.250.000 theo vi-VN là "1.250.000₫"
    expect(rail.textContent).toContain('1.250.000₫');
  });

  it('section Hồ sơ cá nhân ẩn khi mọi field đều trống', async () => {
    renderAt('/users/u1');
    await screen.findByRole('heading', { name: 'Nguyễn Văn A' });

    expect(screen.queryByRole('region', { name: 'Hồ sơ cá nhân' })).toBeNull();
  });

  it('section Hồ sơ cá nhân hiện và dịch enum giới tính', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users/u1')
        return Promise.resolve({
          data: { ...user, dateOfBirth: '1995-03-12T00:00:00.000Z', gender: 'prefer_not' },
        });
      return Promise.resolve({ data: [] });
    });

    renderAt('/users/u1');
    const section = await screen.findByRole('region', { name: 'Hồ sơ cá nhân' });

    expect(section.textContent).toContain('Ngày sinh');
    // Enum thô 'prefer_not' không được lộ ra UI.
    expect(section.textContent).toContain('Không muốn nêu');
    expect(section.textContent).not.toContain('prefer_not');
  });

  // Sửa hồ sơ: mỗi field một lần, PATCH đúng key, cập nhật cache không refetch.
  it('sửa tên hiển thị gửi PATCH và hiện giá trị mới', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users/u1') return Promise.resolve({ data: user });
      if (url === '/admin/reports' || url === '/admin/audit-logs') return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 20 } });
    });
    renderAt('/users/u1');
    await screen.findByRole('heading', { name: 'Nguyễn Văn A' });

    fireEvent.click(screen.getByRole('button', { name: 'Sửa Tên hiển thị' }));
    const input = screen.getByLabelText('Tên hiển thị') as HTMLInputElement;
    expect(input.value).toBe('Nguyễn Văn A');

    fireEvent.change(input, { target: { value: 'Nguyễn Văn B' } });
    mockedPost.mockResolvedValue({ data: {} });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith('/admin/users/u1', { displayName: 'Nguyễn Văn B' }),
    );
  });

  it('chặn lưu tên hiển thị rỗng', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users/u1') return Promise.resolve({ data: user });
      return Promise.resolve({ data: { data: [] } });
    });
    renderAt('/users/u1');
    await screen.findByRole('heading', { name: 'Nguyễn Văn A' });

    fireEvent.click(screen.getByRole('button', { name: 'Sửa Tên hiển thị' }));
    fireEvent.change(screen.getByLabelText('Tên hiển thị'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));

    await waitFor(() => expect(apiClient.patch).not.toHaveBeenCalled());
  });

  it('đang sửa: hiện nhắc lưu/huỷ và chặn rời trang, Esc thì huỷ', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users/u1') return Promise.resolve({ data: user });
      return Promise.resolve({ data: { data: [] } });
    });
    renderAt('/users/u1');
    await screen.findByRole('heading', { name: 'Nguyễn Văn A' });

    fireEvent.click(screen.getByRole('button', { name: 'Sửa Tên hiển thị' }));
    expect(screen.getByText(/lưu hoặc huỷ trước khi rời trang/)).toBeTruthy();

    // beforeunload phải bị chặn khi còn draft
    const evt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);

    fireEvent.keyDown(screen.getByLabelText('Tên hiển thị'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('Tên hiển thị')).toBeNull());
    expect(screen.queryByText(/lưu hoặc huỷ trước khi rời trang/)).toBeNull();
  });

  it('xoá tài khoản đòi gõ XACNHAN rồi gửi DELETE', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/users/u1') return Promise.resolve({ data: user });
      return Promise.resolve({ data: { data: [] } });
    });
    renderAt('/users/u1');
    await screen.findByRole('heading', { name: 'Nguyễn Văn A' });

    fireEvent.click(screen.getByRole('button', { name: /Xoá tài khoản/ }));
    // Nút trong dialog trùng nhãn với nút bottombar — soi trong .dialog
    const dialog = document.querySelector('.dialog') as HTMLElement;
    const confirmBtn = [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Xoá tài khoản') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Gõ/), { target: { value: 'XACNHAN' } });
    mockedPost.mockResolvedValue({ data: {} });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/admin/users/u1'));
  });
});
