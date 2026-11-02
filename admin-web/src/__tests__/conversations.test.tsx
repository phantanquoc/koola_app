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
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockedPatch = apiClient.patch as unknown as ReturnType<typeof vi.fn>;
const mockedDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

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
      internalNote: 'ghi chú cũ',
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

const transcriptResponse = {
  data: {
    data: [
      {
        createdAt: '2026-10-20T00:00:00.000Z',
        senderId: 'u1',
        senderName: 'Minh',
        type: 'text',
        content: 'xin chào',
        deleted: false,
        hasMedia: false,
        replyTo: '',
        pendingReportCount: 0,
      },
    ],
    total: 1,
    truncated: false,
  },
};

function stubApi() {
  mockedGet.mockImplementation(
    (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/admin/reports') {
        // Báo cáo của một tin (badge trên dòng) khác hàng đợi cấp hội thoại.
        if (config?.params?.targetType === 'message') {
          return Promise.resolve({
            data: {
              data: [
                {
                  _id: 'rm1',
                  reason: 'tin spam',
                  status: 'pending',
                  reporterName: 'Lan',
                  createdAt: '2026-10-22T00:00:00.000Z',
                },
              ],
            },
          });
        }
        // Pending queue truyền status; lịch sử thì không (tách hai hàng đợi).
        if (config?.params?.status === 'pending') return Promise.resolve(reportsResponse);
        return Promise.resolve({ data: { data: [resolvedReport] } });
      }
      if (url === '/admin/conversations/stats')
        return Promise.resolve({ data: statsResponse });
      if (url === `/admin/conversations/${CONV_ID}/export`)
        return Promise.resolve(transcriptResponse);
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

describe('Task 8 — export bản ghi từ chi tiết hội thoại', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it('8.2 dialog nêu cap 500 + user content; xác nhận mới GET export (không phân trang)', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    fireEvent.click(screen.getByRole('button', { name: /Xuất CSV/ }));
    expect(await screen.findByRole('heading', { name: /Xuất bản ghi/ })).toBeTruthy();
    expect(screen.getByText(/500 tin nhắn gần nhất/)).toBeTruthy();
    expect(screen.getByText(/dữ liệu người dùng tạo/)).toBeTruthy();
    // Chưa xác nhận thì chưa gọi export
    expect(mockedGet).not.toHaveBeenCalledWith(`/admin/conversations/${CONV_ID}/export`);

    const buttons = screen.getAllByRole('button', { name: 'Xuất CSV' });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith(`/admin/conversations/${CONV_ID}/export`);
    });
    // Export không bao giờ mang phân trang
    const call = mockedGet.mock.calls.find(
      (c) => c[0] === `/admin/conversations/${CONV_ID}/export`,
    );
    expect(call?.[1]).toBeUndefined();
  });
});

describe('admin-conversation-detail-ops — thao tác vận hành', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
    mockedPost.mockResolvedValue({ data: {} });
    mockedPatch.mockResolvedValue({ data: {} });
    mockedDelete.mockResolvedValue({ data: {} });
  });

  /** Hội thoại trực tiếp — dùng để kiểm nút thành viên bị ẩn. */
  function stubDirectConversation() {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/reports') return Promise.resolve({ data: { data: [] } });
      if (url === `/admin/conversations/${CONV_ID}`) {
        const direct = {
          ...detailResponse.data,
          conversation: { ...detailResponse.data.conversation, type: 'direct' },
          pinnedMessages: [],
          reportedMessageCounts: {},
          recentMessages: [detailResponse.data.recentMessages[0]],
        };
        return Promise.resolve({ data: direct });
      }
      return Promise.resolve({ data: {} });
    });
  }

  it('4.1 badge tin nhắn mở panel lười scoped theo tin; chưa xác nhận thì chưa POST, sau đó invalidate', async () => {
    const { client } = renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const badge = await screen.findByRole('button', { name: /2 báo cáo/ });
    // Mở panel mới fetch — trước đó chưa có request targetType=message.
    expect(
      mockedGet.mock.calls.some(
        (c) =>
          c[0] === '/admin/reports' &&
          (c[1] as { params?: { targetType?: string } } | undefined)?.params
            ?.targetType === 'message',
      ),
    ).toBe(false);

    fireEvent.click(badge);

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/admin/reports', {
        params: {
          targetType: 'message',
          targetId: 'm3',
          status: 'pending',
          limit: 50,
        },
      });
    });

    const panel = await screen.findByLabelText('Báo cáo của tin nhắn này');
    fireEvent.click(within(panel).getByRole('button', { name: /Giải quyết/ }));
    expect(
      await screen.findByRole('heading', { name: 'Đánh dấu báo cáo đã xử lý?' }),
    ).toBeTruthy();
    // Confirm trước, POST sau.
    expect(mockedPost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu xử lý' }));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/admin/reports/rm1/resolve');
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversation'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['reports'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversations-stats'] });
    });
  });

  it('4.2 copy đã sửa: bottombar nêu hoàn tác được, confirm gỡ không còn "không thể hoàn tác"', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    expect(document.querySelector('.detail-bottombar-note')?.textContent).toContain(
      'có thể hoàn tác',
    );
    expect(screen.queryByText(/Mở tin nhắn để gỡ nội dung vi phạm/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Gỡ tin nhắn này' }));
    expect(
      await screen.findByRole('heading', { name: 'Gỡ tin nhắn vi phạm?' }),
    ).toBeTruthy();
    expect(screen.getByText(/Có thể hoàn tác/)).toBeTruthy();
    expect(screen.queryByText(/không thể hoàn tác/i)).toBeNull();
  });

  it('4.3 thẻ báo cáo có link "Xem báo cáo" tới /reports/:id', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    const pendingRegion = await screen.findByRole('region', {
      name: 'Báo cáo chờ xử lý',
    });
    const pendingLink = within(pendingRegion).getByRole('link', {
      name: 'Xem báo cáo',
    });
    expect(pendingLink.getAttribute('href')).toBe('/reports/r1');

    const historyRegion = await screen.findByRole('region', {
      name: 'Lịch sử báo cáo',
    });
    const historyLink = within(historyRegion).getByRole('link', {
      name: 'Xem báo cáo',
    });
    expect(historyLink.getAttribute('href')).toBe('/reports/r0');
  });

  it('5.1 nhảy giữa tin bị báo cáo, quấn vòng ở hai đầu', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mockedGet.mockImplementation((url: string) => {
      if (url === '/admin/reports') return Promise.resolve({ data: { data: [] } });
      if (url === `/admin/conversations/${CONV_ID}`)
        return Promise.resolve({
          data: {
            ...detailResponse.data,
            reportedMessageCounts: { m1: 1, m3: 2 },
          },
        });
      return Promise.resolve({ data: {} });
    });
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    const next = screen.getByRole('button', { name: 'Tin bị báo cáo tiếp' });
    fireEvent.click(next);
    expect(screen.getByText('Tin bị báo cáo: 1/2')).toBeTruthy();
    fireEvent.click(next);
    expect(screen.getByText('Tin bị báo cáo: 2/2')).toBeTruthy();
    // Quấn về đầu danh sách.
    fireEvent.click(next);
    expect(screen.getByText('Tin bị báo cáo: 1/2')).toBeTruthy();
    // Lùi một bước từ đầu → về cuối.
    fireEvent.click(screen.getByRole('button', { name: 'Tin bị báo cáo trước' }));
    expect(screen.getByText('Tin bị báo cáo: 2/2')).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('5.2 lọc theo người gửi gửi senderId + tải lại đúng nguồn; xoá lọc trả lại luồng đầy đủ', async () => {
    mockedGet.mockImplementation(
      (url: string, config?: { params?: Record<string, unknown> }) => {
        if (url === '/admin/reports') return Promise.resolve({ data: { data: [] } });
        if (url === `/admin/conversations/${CONV_ID}`) {
          if (config?.params?.senderId === 'u1') {
            return Promise.resolve({
              data: {
                ...detailResponse.data,
                // Đã lọc: chỉ còn tin của u1.
                recentMessages: [detailResponse.data.recentMessages[0]],
                reportedMessageCounts: {},
              },
            });
          }
          return Promise.resolve(detailResponse);
        }
        return Promise.resolve({ data: {} });
      },
    );
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });
    expect(screen.getByText('tin bị báo cáo')).toBeTruthy();

    const select = screen.getByLabelText('Lọc tin nhắn theo người gửi');
    fireEvent.change(select, { target: { value: 'u1' } });

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith(
        `/admin/conversations/${CONV_ID}`,
        { params: { senderId: 'u1' } },
      );
    });
    // Luồng đã bị thu hẹp: tin không phải của u1 biến mất.
    await waitFor(() => {
      expect(screen.queryByText('tin bị báo cáo')).toBeNull();
    });

    // Xoá lọc → query key không senderId (placeholderData giữ ô chọn ổn định).
    const selectAfter = await screen.findByLabelText('Lọc tin nhắn theo người gửi');
    fireEvent.change(selectAfter, { target: { value: '' } });
    await waitFor(() => {
      expect(screen.getByText('tin bị báo cáo')).toBeTruthy();
    });
  });

  it('6.1 bỏ ghim qua confirm — chưa xác nhận chưa DELETE, xác nhận mới gọi', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    const region = await screen.findByRole('region', { name: 'Tin đã ghim' });
    fireEvent.click(within(region).getByRole('button', { name: /Bỏ ghim/ }));

    expect(await screen.findByRole('heading', { name: 'Bỏ ghim tin nhắn?' })).toBeTruthy();
    expect(mockedDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Bỏ ghim' }).at(-1)!);
    await waitFor(() => {
      expect(mockedDelete).toHaveBeenCalledWith(
        `/admin/conversations/${CONV_ID}/pin/m1`,
      );
    });
  });

  it('6.2 ghi chú nội bộ: lưu qua PATCH, xoá bằng chuỗi rỗng, chặn > 500 ký tự', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    const box = screen.getByLabelText('Ghi chú nội bộ của hội thoại') as HTMLTextAreaElement;
    expect(box.value).toBe('ghi chú cũ');
    fireEvent.change(box, { target: { value: 'đang theo dõi spam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));
    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith(
        `/admin/conversations/${CONV_ID}/note`,
        { note: 'đang theo dõi spam' },
      );
    });

    // Trần 500 ký tự chặn ở client: maxLength trên textarea.
    expect(box.getAttribute('maxLength')).toBe('500');

    // Xoá ghi chú = lưu chuỗi rỗng.
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));
    await waitFor(() => {
      expect(mockedPatch).toHaveBeenLastCalledWith(
        `/admin/conversations/${CONV_ID}/note`,
        { note: '' },
      );
    });
  });

  it('6.3 chip thành viên: hành động là sibling của link; hội thoại trực tiếp ẩn hẳn', async () => {
    const { container } = renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    const chip = container.querySelector('.conv-member-chip') as HTMLElement;
    expect(chip).toBeTruthy();
    // Không lồng button trong <a> — link và nút là sibling.
    expect(chip.querySelector('a button')).toBeNull();
    const link = within(chip).getByRole('link', { name: /Minh/ });
    expect(link.getAttribute('href')).toBe('/users/u1');
    expect(within(chip).getByRole('button', { name: /Đổi vai trò Minh/ })).toBeTruthy();
    expect(within(chip).getByRole('button', { name: /Mời Minh ra khỏi nhóm/ })).toBeTruthy();

    // Kick qua confirm.
    fireEvent.click(within(chip).getByRole('button', { name: /Mời Minh ra khỏi nhóm/ }));
    expect(
      await screen.findByRole('heading', { name: 'Mời Minh ra khỏi nhóm?' }),
    ).toBeTruthy();
    expect(mockedDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mời ra khỏi nhóm' }));
    await waitFor(() => {
      expect(mockedDelete).toHaveBeenCalledWith(
        `/admin/conversations/${CONV_ID}/members/u1`,
      );
    });

    // Đổi vai trò cũng qua confirm → POST role với vai trò đảo.
    fireEvent.click(within(chip).getByRole('button', { name: /Đổi vai trò Minh/ }));
    expect(
      await screen.findByRole('heading', { name: 'Chuyển Minh về thành viên?' }),
    ).toBeTruthy();
    expect(mockedPost).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        `/admin/conversations/${CONV_ID}/members/u1/role`,
        { role: 'member' },
      );
    });

    // Hội thoại trực tiếp: không render điều khiển thành viên.
    vi.clearAllMocks();
    stubDirectConversation();
    const direct = renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });
    expect(direct.container.querySelector('.conv-member-actions')).toBeNull();
  });

  it('6.4 hoàn tác gỡ: confirm nêu đảo ngược, POST restore rồi tải lại hội thoại', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    // Gỡ trước để dòng chuyển sang trạng thái deleted (state local).
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ tin nhắn này' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận gỡ' }));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/admin/messages/m1/soft-delete');
    });

    const restoreBtn = await screen.findByRole('button', {
      name: 'Khôi phục tin nhắn này',
    });
    fireEvent.click(restoreBtn);
    expect(
      await screen.findByRole('heading', { name: 'Khôi phục tin nhắn này?' }),
    ).toBeTruthy();
    expect(screen.getByText(/có thể đảo ngược bằng cách gỡ lại/)).toBeTruthy();
    expect(mockedPost).not.toHaveBeenCalledWith('/admin/messages/m1/restore');

    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/admin/messages/m1/restore');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Gỡ tin nhắn này' })).toBeTruthy();
    });
  });
});
