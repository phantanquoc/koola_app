import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, type InitialEntry } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConversationsPage from '../pages/ConversationsPage';
import ConversationsDetailPage from '../pages/ConversationsDetailPage';
import { ToastProvider } from '../components/Toast';
import { dayToIso } from '../components/date-range';
import apiClient from '../apiClient';

vi.mock('../apiClient', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const CONV_ID = '507f1f77bcf86cd799439030';
const RAW_KEY = 'bucket/secret-photo.png';

/** List row theo hợp đồng backend 1.4+: có memberCount/hasMedia, KHÔNG có members. */
const listRow = {
  _id: CONV_ID,
  type: 'group',
  displayName: 'Nhóm Koola',
  memberCount: 5,
  pendingReportCount: 0,
  hasMedia: true,
  lastMessageAt: new Date().toISOString(),
  lastMessagePreview: 'xin chào',
  createdAt: '2026-10-01T00:00:00.000Z',
};

const listResponse = { data: { data: [listRow], total: 1, page: 1, limit: 20 } };

const statsResponse = {
  all: 1,
  pendingReport: 0,
  group: 1,
  direct: 0,
  hasMedia: 1,
  active24h: 1,
};

const detailResponse = {
  data: {
    conversation: {
      _id: CONV_ID,
      type: 'group',
      displayName: 'Nhóm Koola',
      createdAt: '2026-10-01T00:00:00.000Z',
      lastMessageAt: '2026-10-20T00:00:00.000Z',
      avatar: 'https://koola.local/conv-avatar.png',
      createdBy: '69cf33318ebc501e439e722a',
    },
    members: [
      {
        userId: 'u1',
        displayName: 'Minh',
        role: 'admin',
        accountType: 'business',
        joinedAt: '2026-09-01T12:00:00.000Z',
      },
    ],
    recentMessages: [
      {
        _id: 'm1',
        senderId: 'u1',
        content: 'xin chào',
        type: 'text',
        createdAt: '2026-10-20T00:00:00.000Z',
        replyTo: 'm0',
        replyToPreview: { senderId: 'u1', text: 'báo giá giúp nhé' },
        reactions: [
          { userId: 'u2', emoji: '👍' },
          { userId: 'u3', emoji: '👍' },
        ],
      },
      {
        _id: 'm2',
        senderId: 'u1',
        content: 'ảnh đính kèm',
        type: 'image',
        mediaUrl: RAW_KEY,
        mediaUrlSigned: null,
        createdAt: '2026-10-20T00:01:00.000Z',
      },
      { _id: 'm3', senderId: 'u1', content: 'tin bị báo cáo', type: 'text', createdAt: '2026-10-20T00:02:00.000Z' },
    ],
    pinnedMessages: [
      {
        messageId: 'm1',
        pinnedBy: 'u1',
        pinnedByName: 'Minh',
        pinnedAt: '2026-10-21T00:00:00.000Z',
        found: true,
        content: 'xin chào',
        type: 'text',
        deleted: false,
        senderName: 'Minh',
      },
    ],
    hasMore: false,
    reportedMessageCounts: { m3: 2 },
  },
};

const pendingReport = {
  _id: 'r1',
  reason: 'spam',
  status: 'pending',
  reporterName: 'Lan',
  createdAt: '2026-10-21T00:00:00.000Z',
};

const resolvedReport = {
  _id: 'r0',
  reason: 'spam cũ đã xử lý',
  status: 'resolved',
  reporterName: 'Lan',
  createdAt: '2026-09-01T00:00:00.000Z',
  resolvedByName: 'Admin B',
  resolvedAt: '2026-09-02T00:00:00.000Z',
};

const reportsResponse = { data: { data: [pendingReport] } };

function stubApi() {
  mockedGet.mockImplementation(
    (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/admin/reports') {
        // Pending queue truyền status; lịch sử thì không (tách hai hàng đợi).
        if (config?.params?.status === 'pending') return Promise.resolve(reportsResponse);
        return Promise.resolve({ data: { data: [resolvedReport] } });
      }
      if (url === '/admin/conversations/stats')
        return Promise.resolve({ data: statsResponse });
      if (url === `/admin/conversations/${CONV_ID}`)
        return Promise.resolve(detailResponse);
      if (url === '/admin/conversations/export')
        return Promise.resolve({
          data: { data: [listRow], total: 1, truncated: false },
        });
      if (url === '/admin/conversations') return Promise.resolve(listResponse);
      void config;
      return Promise.resolve({ data: {} });
    },
  );
}

function renderPage(entry: InitialEntry = '/conversations') {
  const entries = Array.isArray(entry) ? entry : [entry];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <MemoryRouter initialEntries={entries}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <Routes>
            <Route path="/conversations" element={<ConversationsPage />} />
            <Route path="/conversations/:id" element={<ConversationsDetailPage />} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...utils, client };
}

/** Lấy tham số list đã gửi (call cuối cùng tới '/admin/conversations'). */
function lastListParams(): Record<string, unknown> {
  const calls = mockedGet.mock.calls.filter((c) => c[0] === '/admin/conversations');
  const last = calls[calls.length - 1];
  return (last?.[1] as { params: Record<string, unknown> })?.params ?? {};
}

describe('ConversationsPage — 3.1 URL → request params', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('3.0 hàng hiện memberCount từ list row (backend 1.4 bỏ members)', async () => {
    renderPage();
    const name = await screen.findByText('Nhóm Koola');
    const row = name.closest('tr');
    expect(row).toBeTruthy();
    expect(row?.textContent).toContain('5');
  });

  it('3.1 mọi filter dịch 1-1 sang DTO; tên URL không rò vào request', async () => {
    renderPage(
      '/conversations?tab=all&q=koola&sort=created&type=group&size=medium&minReports=3&media=true&since=7d&from=2026-10-01&to=2026-10-31&afrom=2026-09-01&ato=2026-09-15&page=1&pageSize=50',
    );
    await screen.findByText('Nhóm Koola');

    const params = lastListParams();
    expect(params).toMatchObject({
      search: 'koola',
      sort: 'created',
      type: 'group',
      minMembers: 10,
      maxMembers: 99,
      minReports: 3,
      hasMedia: 'true',
      page: 1,
      limit: 50,
    });
    expect(typeof params.activeAfter).toBe('string');
    // Biên ngày sinh từ chuỗi ngày theo quy ước 00:00 / 23:59:59.999 (dayToIso)
    expect(params.createdFrom).toBe(dayToIso('2026-10-01', 'from'));
    expect(params.createdTo).toBe(dayToIso('2026-10-31', 'to'));
    // Khoảng ngày hoạt động (7.6) map sang activeFrom/activeTo
    expect(params.activeFrom).toBe(dayToIso('2026-09-01', 'from'));
    expect(params.activeTo).toBe(dayToIso('2026-09-15', 'to'));
    // focus/tab/q/pageSize là tên URL, không phải tên DTO (forbidNonWhitelisted → 400)
    expect(params).not.toHaveProperty('focus');
    expect(params).not.toHaveProperty('tab');
    expect(params).not.toHaveProperty('q');
    expect(params).not.toHaveProperty('pageSize');
    expect(params).not.toHaveProperty('afrom');
    expect(params).not.toHaveProperty('ato');
  });

  it('3.1 focus nằm trong URL nhưng KHÔNG BAO GIỜ trong params gọi API', async () => {
    renderPage(`/conversations?focus=${CONV_ID}`);

    // Đã redirect sang route chi tiết
    expect(await screen.findByRole('heading', { name: 'Nhóm Koola' })).toBeTruthy();
    for (const call of mockedGet.mock.calls) {
      const params = (call[1] as { params?: Record<string, unknown> } | undefined)?.params;
      if (params) expect(params).not.toHaveProperty('focus');
    }
  });

  it('3.1 tab dịch sang param và override filter cùng trục; stats strip phần tab', async () => {
    renderPage('/conversations?tab=group&type=direct&media=true');
    await screen.findByText('Nhóm Koola');

    const listParams = lastListParams();
    // tab thắng type ở list
    expect(listParams.type).toBe('group');
    expect(listParams.hasMedia).toBe('true');

    await waitFor(() => {
      const statsCall = mockedGet.mock.calls.find((c) => c[0] === '/admin/conversations/stats');
      expect(statsCall).toBeTruthy();
      const statsParams = (statsCall![1] as { params: Record<string, unknown> }).params;
      // stats phải bỏ type (tab đang đếm group/direct) nhưng giữ media của popover
      expect(statsParams.type).toBeUndefined();
      expect(statsParams.hasMedia).toBe('true');
      expect(statsParams.page).toBeUndefined();
      expect(statsParams.limit).toBeUndefined();
    });
  });

  it('3.1 tab=pendingReport gửi hasPendingReport=true', async () => {
    renderPage('/conversations?tab=pendingReport');
    await screen.findByText('Nhóm Koola');
    expect(lastListParams().hasPendingReport).toBe('true');
  });

  it('3.8 ?focus= redirect replace sang route chi tiết, state.from bỏ focus', async () => {
    renderPage('/conversations?tab=pendingReport&focus=' + CONV_ID);

    expect(
      await screen.findByRole('heading', { name: 'Nhóm Koola' }),
    ).toBeTruthy();
    // Không còn ở list nữa
    expect(screen.queryByLabelText('Danh sách hội thoại')).toBeNull();
    expect(mockedGet).toHaveBeenCalledWith(`/admin/conversations/${CONV_ID}`);
  });
});

describe('ConversationsPage — 3.2/3.3/3.6 header, tabs, chips, pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('3.2 tab hiện count từ stats, 0 thì ẩn count', async () => {
    renderPage();
    await screen.findByText('Nhóm Koola');

    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    const byLabel = (label: string) => tabs.find((t) => t.textContent?.startsWith(label));
    // stats: all=1, group=1 → có count; pendingReport=0 → ẩn count
    expect(byLabel('Tất cả')?.querySelector('.tab-count')?.textContent).toBe('1');
    expect(byLabel('Nhóm')?.querySelector('.tab-count')?.textContent).toBe('1');
    expect(byLabel('Chờ báo cáo')?.querySelector('.tab-count')).toBeNull();
  });

  it('3.3 chip hiện điều kiện đang bật và gỡ chip thì xoá param', async () => {
    renderPage('/conversations?type=group');
    await screen.findByText('Nhóm Koola');

    const chip = screen.getByRole('button', { name: /Loại: Nhóm/ });
    fireEvent.click(chip);

    await waitFor(() => {
      expect(lastListParams().type).toBeUndefined();
    });
    expect(screen.queryByRole('button', { name: /Loại: Nhóm/ })).toBeNull();
  });

  it('3.6 đổi page-size reset về trang 1 và nằm trong URL', async () => {
    renderPage('/conversations?page=3&pageSize=20');
    await screen.findByText('Nhóm Koola');

    const select = screen.getByLabelText('Số dòng mỗi trang');
    fireEvent.change(select, { target: { value: '50' } });

    await waitFor(() => {
      const params = lastListParams();
      expect(params.limit).toBe(50);
      expect(params.page).toBe(1);
    });
  });
});

describe('ConversationsPage — 3.4 bảng + 3.8 row navigate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('3.4 aria-sort đổi khi bấm cột sort và sort nằm trong URL', async () => {
    renderPage();
    await screen.findByText('Nhóm Koola');

    const membersHeader = screen.getByRole('columnheader', { name: /Thành viên/ });
    expect(membersHeader.getAttribute('aria-sort')).toBe('none');

    fireEvent.click(within(membersHeader).getByRole('button'));

    await waitFor(() => {
      expect(lastListParams().sort).toBe('members');
    });
    // Bảng refetch theo key mới → chờ row hiện lại trước khi đọc aria-sort
    await screen.findByText('Nhóm Koola');
    const after = screen.getByRole('columnheader', { name: /Thành viên/ });
    expect(after.getAttribute('aria-sort')).toBe('descending');
    const recentHeader = screen.getByRole('columnheader', { name: /Hoạt động cuối/ });
    expect(recentHeader.getAttribute('aria-sort')).toBe('none');
  });

  it('3.4 cột Tuổi/Media có dữ liệu thật (ageTone + hasMedia)', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/conversations/stats') return Promise.resolve({ data: statsResponse });
      if (url === '/admin/conversations')
        return Promise.resolve({
          data: {
            data: [
              {
                ...listRow,
                pendingReportCount: 3,
                oldestPendingReportAt: '2026-10-01T02:00:00.000Z',
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
          },
        });
      return Promise.resolve({ data: {} });
    });
    renderPage();
    await screen.findByText('Nhóm Koola');

    expect(screen.getByText('3 báo cáo')).toBeTruthy();
    // Tuổi >72h → có nhãn tuổi (cột Tuổi + dòng .show-under-1100 trùng nhau)
    expect(screen.getAllByText(/\d+ ngày/).length).toBeGreaterThan(0);
    const row = (await screen.findByText('Nhóm Koola')).closest('tr');
    expect(row).toBeTruthy();
    // Badge media nằm trong hàng, không phải tab
    expect(within(row as HTMLElement).getByText('Có media')).toBeTruthy();
    // Row không có members → không rớt về 0 giả
    expect(within(row as HTMLElement).getByText('5')).toBeTruthy();
  });

  it('3.8 bấm hàng navigate tới /conversations/:id kèm state.from là list URL', async () => {
    renderPage('/conversations?tab=group&q=koola');
    await screen.findByText('Nhóm Koola');

    const name = screen.getByText('Nhóm Koola');
    fireEvent.click(name);

    expect(await screen.findByRole('heading', { name: 'Nhóm Koola' })).toBeTruthy();
    expect(mockedGet).toHaveBeenCalledWith(`/admin/conversations/${CONV_ID}`);
  });
});

describe('ConversationsPage — 3.5 trạng thái', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('3.5 lỗi hiện StateBlock error + Thử lại gọi refetch', async () => {
    let fail = true;
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/conversations' && fail) {
        fail = false;
        return Promise.reject({ response: { data: { message: 'Server sập' } } });
      }
      if (url === '/admin/conversations/stats') return Promise.resolve({ data: statsResponse });
      if (url === '/admin/conversations') return Promise.resolve(listResponse);
      return Promise.resolve({ data: {} });
    });
    renderPage();

    expect(await screen.findByText('Không tải được danh sách hội thoại')).toBeTruthy();
    expect(screen.getByText('Server sập')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Nhóm Koola')).toBeTruthy();
  });

  it('3.5 rỗng do lọc khác rỗng thật — có nút Xoá bộ lọc khi đang lọc', async () => {
    stubApi();
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/conversations/stats') return Promise.resolve({ data: statsResponse });
      if (url === '/admin/conversations')
        return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 20 } });
      return Promise.resolve({ data: {} });
    });
    renderPage('/conversations?q=khong-ton-tai');

    expect(await screen.findByText('Không khớp hội thoại nào')).toBeTruthy();
    // Nút Xoá bộ lọc có ở cả chip row lẫn empty-state action
    expect(screen.getAllByRole('button', { name: 'Xoá bộ lọc' }).length).toBeGreaterThan(0);
  });

  it('3.5 rỗng thật hiện copy theo tab, không nút Xoá bộ lọc', async () => {
    stubApi();
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/conversations/stats') return Promise.resolve({ data: statsResponse });
      if (url === '/admin/conversations')
        return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 20 } });
      return Promise.resolve({ data: {} });
    });
    renderPage('/conversations?tab=pendingReport');

    expect(await screen.findByText('Hàng đợi trống')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).toBeNull();
  });
});

describe('ConversationsPage — 3.7 bàn phím', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('3.7 J/K chuyển highlight, ? mở bảng phím tắt', async () => {
    renderPage();
    await screen.findByText('Nhóm Koola');

    fireEvent.keyDown(document, { key: 'j' });
    await waitFor(() => {
      expect(document.querySelector('.row-highlight')).toBeTruthy();
    });

    fireEvent.keyDown(document, { key: '?' });
    expect(await screen.findByRole('heading', { name: 'Phím tắt' })).toBeTruthy();
  });
});

describe('ConversationDetail route /conversations/:id (4.1–4.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('4.6 deep-link trực tiếp vào URL chi tiết render hội thoại', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    expect(await screen.findByRole('heading', { name: 'Nhóm Koola' })).toBeTruthy();
    expect(mockedGet).toHaveBeenCalledWith(`/admin/conversations/${CONV_ID}`);
  });

  it('4.1 Quay lại đưa về đúng list URL trong location.state.from', async () => {
    renderPage({
      pathname: `/conversations/${CONV_ID}`,
      state: { from: '/conversations?tab=pendingReport&page=2' },
    });
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    fireEvent.click(screen.getByRole('button', { name: /Quay lại danh sách/ }));

    expect(await screen.findByText(/1 hội thoại/)).toBeTruthy();
    // state.from có page=2 → clamp kẹp về trang 1, chờ lần fetch đó
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/admin/conversations', {
        params: expect.objectContaining({ page: 1 }),
      });
    });
  });

  it('4.1 mở trực tiếp (không state) thì Quay lại về list trơn', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    fireEvent.click(screen.getByRole('button', { name: /Quay lại danh sách/ }));

    expect(await screen.findByText(/1 hội thoại/)).toBeTruthy();
  });
});

describe('ConversationDetail (4.2–4.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('4.2 ObjectId chỉ nằm trong disclosure "Chi tiết kỹ thuật", member link /users/:id', async () => {
    const { container } = renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
    const hits: Element[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n as Element;
      if (el.children.length === 0 && el.textContent?.trim() === CONV_ID) hits.push(el);
    }
    expect(hits.length).toBeGreaterThan(0);
    for (const el of hits) expect(el.closest('details')).toBeTruthy();

    const memberLink = screen.getByRole('link', { name: /Minh/ });
    expect(memberLink.getAttribute('href')).toBe('/users/u1');
  });

  it('4.3 mediaUrlSigned=null hiện khối lỗi, không bao giờ dùng raw key làm src', async () => {
    const { container } = renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    expect(await screen.findByText('Không tải được media')).toBeTruthy();
    expect(screen.getByText('ảnh đính kèm')).toBeTruthy();
    for (const el of container.querySelectorAll('img, audio, video, a')) {
      const src = el.getAttribute('src') ?? el.getAttribute('href') ?? '';
      expect(src).not.toContain(RAW_KEY);
    }
    // Trong luồng tin nhắn không có img nào (ảnh đại diện ở header là img hợp lệ,
    // không thuộc stream tin nhắn)
    expect(container.querySelector('.conv-msg-media img')).toBeNull();
  });

  it('4.4 badge báo cáo hiện số lượng trên tin nhắn bị báo cáo', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    expect(await screen.findByText('2 báo cáo')).toBeTruthy();
    expect(screen.getByText('1 báo cáo')).toBeTruthy();
  });

  it('4.5 fetch báo cáo scoped theo targetId + status, resolve invalidate list', async () => {
    mockedPost.mockResolvedValue({ data: {} });
    const { client } = renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/admin/reports', {
        params: { targetType: 'conversation', targetId: CONV_ID, status: 'pending', limit: 50 },
      });
    });

    const reportsSection = screen.getByRole('region', { name: 'Báo cáo chờ xử lý' });
    fireEvent.click(within(reportsSection).getByRole('button', { name: /Giải quyết/ }));

    // Resolve/dismiss phải qua ConfirmDialog (task 4.5) — chưa bấm xác nhận
    // thì KHÔNG được gọi API.
    expect(
      await screen.findByRole('heading', { name: 'Đánh dấu báo cáo đã xử lý?' }),
    ).toBeTruthy();
    // reason hiện ở card VÀ trong mô tả dialog confirm
    expect(screen.getAllByText(/spam/).length).toBeGreaterThanOrEqual(2);
    expect(mockedPost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu xử lý' }));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(`/admin/reports/r1/resolve`);
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversations'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversations-stats'] });
    });
  });
});

describe('ConversationsPage — 5.1 export dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('5.1 dialog nêu phạm vi + cap 500, exportParams bỏ phân trang', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/conversations/stats') return Promise.resolve({ data: statsResponse });
      if (url === '/admin/conversations') return Promise.resolve(listResponse);
      if (url === '/admin/conversations/export')
        return Promise.resolve({ data: { data: [listRow], total: 1, truncated: false } });
      return Promise.resolve({ data: {} });
    });
    renderPage('/conversations?tab=group');
    await screen.findByText('Nhóm Koola');

    fireEvent.click(screen.getByRole('button', { name: /Xuất CSV/ }));
    expect(
      await screen.findByRole('heading', { name: 'Xuất 1 hội thoại ra CSV?' }),
    ).toBeTruthy();
    expect(screen.getByText(/Tối đa 500 dòng/)).toBeTruthy();
    expect(screen.getByText(/nội dung do người dùng tạo/)).toBeTruthy();

    // Nút confirm cùng tên với nút mở dialog — bấm nút cuối (trong dialog)
    const exportButtons = screen.getAllByRole('button', { name: 'Xuất CSV' });
    fireEvent.click(exportButtons[exportButtons.length - 1]);

    await waitFor(() => {
      const call = mockedGet.mock.calls.find((c) => c[0] === '/admin/conversations/export');
      expect(call).toBeTruthy();
      const params = (call![1] as { params: Record<string, unknown> }).params;
      expect(params).not.toHaveProperty('page');
      expect(params).not.toHaveProperty('limit');
      expect(params.type).toBe('group');
    });
  });
});
describe('Mở rộng sau audit (task 7) — list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('7.6 khoảng ngày hoạt động trong popover → activeFrom/activeTo trong params', async () => {
    renderPage('/conversations?afrom=2026-10-05&ato=2026-10-10');
    await screen.findByText('Nhóm Koola');

    const params = lastListParams();
    expect(params.activeFrom).toBe(dayToIso('2026-10-05', 'from'));
    expect(params.activeTo).toBe(dayToIso('2026-10-10', 'to'));
    // Chip activity hiện trong context-row
    expect(screen.getByRole('button', { name: /Hoạt động:/ })).toBeTruthy();
  });

  it('7.1 bấm cột Tuổi → sort=reportAge trong URL, aria-sort ascending', async () => {
    renderPage();
    await screen.findByText('Nhóm Koola');

    const ageHeader = screen.getByRole('columnheader', { name: /Tuổi/ });
    expect(ageHeader.getAttribute('aria-sort')).toBe('none');
    fireEvent.click(within(ageHeader).getByRole('button'));

    await waitFor(() => {
      expect(lastListParams().sort).toBe('reportAge');
    });
    await screen.findByText('Nhóm Koola');
    expect(
      screen.getByRole('columnheader', { name: /Tuổi/ }).getAttribute('aria-sort'),
    ).toBe('ascending');
  });
});

describe('Mở rộng sau audit (task 7) — detail context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('7.4 avatar http(s) render thành img, scheme khác fallback initials', async () => {
    const { container } = renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });
    const img = container.querySelector('.detail-avatar img');
    expect(img?.getAttribute('src')).toBe('https://koola.local/conv-avatar.png');

    // Scheme không an toàn → không render img (guard §0.7)
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/conversations/stats') return Promise.resolve({ data: statsResponse });
      if (url === '/admin/conversations')
        return Promise.resolve({
          data: {
            ...detailResponse.data,
            conversation: { ...detailResponse.data.conversation, avatar: 'javascript:alert(1)' },
          },
        });
      if (url === '/admin/reports') return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: {} });
    });
    const second = renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });
    expect(second.container.querySelector('.detail-avatar img')).toBeNull();
  });

  it('7.4 createdBy nằm trong Chi tiết kỹ thuật; member hiện DN + ngày tham gia', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    // createdBy chỉ trong disclosure
    const createdBy = screen.getByText('69cf33318ebc501e439e722a');
    expect(createdBy.closest('details')).toBeTruthy();

    expect(screen.getByText('Doanh nghiệp')).toBeTruthy();
    const joined = new Date('2026-09-01T12:00:00.000Z').toLocaleDateString('vi-VN');
    expect(screen.getByText(new RegExp(`tham gia ${joined.replace(/\//g, '\\/')}`))).toBeTruthy();
  });

  it('7.4 section Đã ghim resolve nội dung + tên ghim, không hiện messageId trần', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    const region = await screen.findByRole('region', { name: 'Tin đã ghim' });
    expect(within(region).getByText('Đã ghim (1)')).toBeTruthy();
    expect(within(region).getByText('xin chào')).toBeTruthy();
    expect(within(region).getByText(/Đã ghim bởi Minh/)).toBeTruthy();
    expect(within(region).queryByText('m1')).toBeNull();
  });

  it('7.3 reply quote + reaction tally render trong bong bóng tin nhắn', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    const quote = document.querySelector('.conv-reply-quote');
    expect(quote?.textContent).toContain('Minh');
    expect(quote?.textContent).toContain('báo giá giúp nhé');

    const tally = document.querySelector('.conv-reactions');
    expect(tally?.textContent).toContain('👍');
    expect(tally?.textContent).toContain('2');
    // userId là dữ liệu thô — không hiện trong tally
    expect(tally?.textContent).not.toContain('u2');
  });

  it('7.5 lịch sử báo cáo: query KHÔNG truyền status, tách khỏi hàng đợi pending', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/admin/reports', {
        params: { targetType: 'conversation', targetId: CONV_ID, limit: 20 },
      });
    });

    const region = await screen.findByRole('region', { name: 'Lịch sử báo cáo' });
    expect(within(region).getByText('Lịch sử báo cáo (1)')).toBeTruthy();
    expect(within(region).getByText('spam cũ đã xử lý')).toBeTruthy();
    expect(within(region).getByText('Đã xử lý')).toBeTruthy();
    expect(within(region).getByText(/xử lý bởi Admin B/)).toBeTruthy();
    // Hàng đợi pending không chứa báo cáo đã xử lý
    const pendingRegion = screen.getByRole('region', { name: 'Báo cáo chờ xử lý' });
    expect(within(pendingRegion).queryByText('spam cũ đã xử lý')).toBeNull();
  });
});
