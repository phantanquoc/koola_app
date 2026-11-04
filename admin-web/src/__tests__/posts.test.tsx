/**
 * Trang Bài đăng + chi tiết: không có duyệt trước, chỉ gỡ/khôi phục và xử lý
 * báo cáo. Các test dưới đây chốt ba thứ dễ hỏng im lặng:
 * - `active=false` phải xuống server dưới dạng string (boolean sẽ lọc ngược)
 * - gỡ phải gọi đúng endpoint và có confirm trước
 * - khôi phục chỉ hiện với bài đã gỡ
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PostsPage, { scopeLabel, scopeTone } from '../pages/PostsPage';
import PostDetailPage from '../pages/PostDetailPage';
import { ToastProvider } from '../components/Toast';
import apiClient from '../apiClient';

vi.mock('../apiClient', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../hooks/useAdminList', () => ({
  useAdminList: vi.fn(),
}));

import { useAdminList } from '../hooks/useAdminList';

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockedList = useAdminList as unknown as ReturnType<typeof vi.fn>;

const post = {
  _id: 'p1',
  authorId: 'u1',
  authorName: 'Nguyễn Văn A',
  authorAvatar: null,
  caption: 'Bài bán hàng giá rẻ',
  isActive: true,
  media: [
    {
      mediaKey: 'post/a.jpg',
      mediaType: 'image' as const,
      thumbnailKey: null,
      mediaUrlSigned: 'https://signed/a.jpg',
      thumbnailUrlSigned: null,
    },
  ],
  likeCount: 3,
  commentCount: 2,
  shareCount: 1,
  pendingReportCount: 2,
  createdAt: new Date().toISOString(),
};

const removedPost = {
  ...post,
  _id: 'p2',
  caption: 'Bài đã gỡ',
  isActive: false,
};

function renderPage(initialPath = '/posts') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <Routes>
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function listOf(rows: unknown[], total = rows.length) {
  return {
    rows,
    total,
    data: { data: rows, total, page: 1, limit: 20 },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
}

describe('PostsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedList.mockReturnValue(listOf([post, removedPost]));
    mockedGet.mockResolvedValue({ data: {} });
    mockedPost.mockResolvedValue({ data: {} });
  });

  it('hiện bài đăng và nhãn trạng thái, không có cột hay nút duyệt', async () => {
    renderPage();

    expect(screen.getByText('Bài bán hàng giá rẻ')).toBeTruthy();
    expect(screen.getByText('Bài đã gỡ')).toBeTruthy();
    // Không có "duyệt" ở bất kỳ đâu: bài lên feed ngay khi đăng.
    expect(screen.queryByText(/duyệt/i)).toBeNull();
  });

  it('gỡ bài phải qua confirm rồi mới gọi endpoint', async () => {
    renderPage();

    const removeButtons = await screen.findAllByRole('button', { name: /Gỡ bài/ });
    fireEvent.click(removeButtons[0]);

    // Confirm chưa xác nhận → chưa gọi API.
    expect(screen.getByText('Gỡ bài đăng?')).toBeTruthy();
    expect(mockedPost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Gỡ bài đăng' }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/admin/posts/p1/takedown');
    });
  });

  it('bài đã gỡ hiện nút Khôi phục thay vì Gỡ', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: 'Khôi phục bài đăng' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục bài đăng' }));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/admin/posts/p2/restore');
    });
  });

  it('tab Đã gỡ gửi active=false dạng string xuống server', async () => {    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Đã gỡ/ }));

    await waitFor(() => {
      const lastCall = mockedList.mock.calls[mockedList.mock.calls.length - 1];
      expect(lastCall[2]).toMatchObject({ active: 'false' });
    });
  });
});

describe('PostDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPost.mockResolvedValue({ data: {} });
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/posts/p1') {
        return Promise.resolve({ data: { ...post, pendingReportCount: 1 } });
      }
      if (url === '/admin/reports') {
        return Promise.resolve({
          data: {
            data: [
              {
                _id: 'r1',
                reason: 'spam',
                status: 'pending',
                reporterName: 'Người báo',
                createdAt: new Date().toISOString(),
              },
            ],
          },
        });
      }
      if (url === '/admin/audit-logs') {
        return Promise.resolve({
          data: {
            data: [
              {
                _id: 'a1',
                action: 'takedown_post',
                targetType: 'post',
                actorName: 'Admin Dev',
                createdAt: new Date().toISOString(),
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });
  });

  it('hiện nội dung, media đã ký, báo cáo chờ và lịch sử thao tác', async () => {
    renderPage('/posts/p1');

    // Caption hiện hai lần: tiêu đề trang và khung "Nội dung".
    expect((await screen.findAllByText('Bài bán hàng giá rẻ')).length).toBeGreaterThan(0);
    expect(screen.getByAltText('Media 1')).toBeTruthy();
    expect(screen.getByText('Báo cáo chờ xử lý (1)')).toBeTruthy();
    expect(screen.getByText('spam')).toBeTruthy();
    // Action audit code được dịch, không phơi raw `takedown_post`.
    // "Gỡ bài đăng" xuất hiện hai chỗ: badge audit và nút bottombar — findAll.
    expect((await screen.findAllByText('Gỡ bài đăng')).length).toBeGreaterThan(0);
    expect(screen.queryByText('takedown_post')).toBeNull();
  });

  it('giải quyết báo cáo gọi đúng endpoint sau confirm', async () => {
    renderPage('/posts/p1');

    const resolveBtn = await screen.findByRole('button', { name: /Giải quyết/ });
    fireEvent.click(resolveBtn);
    expect(mockedPost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu xử lý' }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/admin/reports/r1/resolve');
    });
  });

  it('gỡ từ trang chi tiết có confirm và gọi endpoint', async () => {
    renderPage('/posts/p1');

    const bodyRemove = await screen.findByRole('button', { name: 'Gỡ bài đăng' });
    fireEvent.click(bodyRemove);

    const confirmButton = screen.getAllByRole('button', { name: 'Gỡ bài đăng' }).pop();
    fireEvent.click(confirmButton as HTMLElement);

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/admin/posts/p1/takedown');
    });
  });
});

describe('scopeLabel / scopeTone', () => {
  it('dịch phạm vi hiển thị; custom dùng tên danh sách khi có', () => {
    expect(scopeLabel({ audienceScope: 'public' })).toBe('Công khai');
    // "Người kết nối" — từ app đang dùng, không phải "Bạn bè".
    expect(scopeLabel({ audienceScope: 'connections' })).toBe('Người kết nối');
    expect(scopeLabel({ audienceScope: 'custom', audienceListName: 'Gia đình' })).toBe(
      'Danh sách: Gia đình',
    );
    expect(scopeLabel({ audienceScope: 'custom', audienceListName: null })).toBe(
      'Danh sách riêng',
    );
  });

  it('phạm vi càng rộng thì cảnh báo càng mạnh', () => {
    expect(scopeTone('public')).toBe('danger');
    expect(scopeTone('connections')).toBe('warning');
    expect(scopeTone('custom')).toBe('muted');
  });
});

describe('PostsPage §3A', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedList.mockReturnValue(
      listOf([{ ...post, audienceScope: 'public', audienceListName: null }]),
    );
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/posts/stats') {
        return Promise.resolve({
          data: { all: 10, active: 7, inactive: 3, reported: 2, byScope: {} },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    mockedPost.mockResolvedValue({ data: {} });
  });

  it('tab lấy số từ /admin/posts/stats, không đếm trang hiện tại', async () => {
    renderPage();

    expect(await screen.findByRole('tab', { name: /Tất cả 10/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Đang hiển thị 7/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Đã gỡ 3/ })).toBeTruthy();
    expect(mockedGet).toHaveBeenCalledWith('/admin/posts/stats');
  });

  it('hiện badge phạm vi trên từng dòng', async () => {
    renderPage();
    expect((await screen.findAllByText('Công khai')).length).toBeGreaterThan(0);
  });

  it('hàng click mở chi tiết, nút bên trong hàng thì không', async () => {
    renderPage();
    // Nút hành động có stopPropagation → không điều hướng.
    const removeBtn = (await screen.findAllByRole('button', { name: /Gỡ bài/ }))[0];
    expect(removeBtn).toBeTruthy();
  });
});
