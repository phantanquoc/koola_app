import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, type InitialEntry } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConversationsPage from '../pages/ConversationsPage';
import ConversationsDetailPage from '../pages/ConversationsDetailPage';
import { ToastProvider } from '../components/Toast';
import apiClient from '../apiClient';

vi.mock('../apiClient', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const mockedGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const CONV_ID = '507f1f77bcf86cd799439030';
const RAW_KEY = 'bucket/secret-photo.png';

/** List row theo hợp đồng backend 1.4: có memberCount, KHÔNG có members. */
const listRow = {
  _id: CONV_ID,
  type: 'group',
  displayName: 'Nhóm Koola',
  memberCount: 5,
  pendingReportCount: 0,
  lastMessageAt: new Date().toISOString(),
  lastMessagePreview: 'xin chào',
};

const listResponse = { data: { data: [listRow], total: 1, page: 1, limit: 20 } };

const detailResponse = {
  data: {
    conversation: {
      _id: CONV_ID,
      type: 'group',
      displayName: 'Nhóm Koola',
      createdAt: '2026-10-01T00:00:00.000Z',
      lastMessageAt: '2026-10-20T00:00:00.000Z',
    },
    members: [{ userId: 'u1', displayName: 'Minh', role: 'admin' }],
    recentMessages: [
      { _id: 'm1', senderId: 'u1', content: 'xin chào', type: 'text', createdAt: '2026-10-20T00:00:00.000Z' },
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

const reportsResponse = { data: { data: [pendingReport] } };

function stubApi() {
  mockedGet.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === '/admin/reports') return Promise.resolve(reportsResponse);
    if (url === `/admin/conversations/${CONV_ID}`) return Promise.resolve(detailResponse);
    if (url.startsWith('/admin/conversations')) return Promise.resolve(listResponse);
    return Promise.resolve({ data: {} });
  });
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

describe('ConversationsPage', () => {
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
    expect(mockedGet).toHaveBeenCalledWith(
      expect.stringContaining('/admin/conversations?'),
    );
  });
});

describe('ConversationsDetailPage — route /conversations/:id (4.1, 4.6)', () => {
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
      state: { from: '/conversations?tab=pending&page=2' },
    });
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    fireEvent.click(screen.getByRole('button', { name: /Quay lại danh sách/ }));

    expect(await screen.findByText(/1 hội thoại/)).toBeTruthy();
    expect(mockedGet).toHaveBeenCalledWith(
      expect.stringContaining('/admin/conversations?page=1'),
    );
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

    // Mọi phần tử có nguyên văn ObjectId phải nằm trong <details>
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
    const hits: Element[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n as Element;
      if (el.children.length === 0 && el.textContent?.trim() === CONV_ID) hits.push(el);
    }
    expect(hits.length).toBeGreaterThan(0);
    for (const el of hits) expect(el.closest('details')).toBeTruthy();

    // Thành viên là link tới trang người dùng
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
    expect(container.querySelector('img')).toBeNull();
  });

  it('4.4 badge báo cáo hiện số lượng trên tin nhắn bị báo cáo', async () => {
    renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    expect(await screen.findByText('2 báo cáo')).toBeTruthy();
    // Header cũng đếm báo cáo chờ từ query reports
    expect(screen.getByText('1 báo cáo')).toBeTruthy();
  });

  it('4.5 fetch báo cáo scoped theo targetId + status, resolve invalidate list', async () => {
    mockedPost.mockResolvedValue({ data: {} });
    const { client } = renderPage(`/conversations/${CONV_ID}`);
    await screen.findByRole('heading', { name: 'Nhóm Koola' });

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith('/admin/reports', {
        params: { targetType: 'conversation', targetId: CONV_ID, status: 'pending', limit: 50 },
      });
    });

    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const reportsSection = screen.getByRole('region', { name: 'Báo cáo chờ xử lý' });
    fireEvent.click(within(reportsSection).getByRole('button', { name: /Giải quyết/ }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(`/admin/reports/r1/resolve`);
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversations'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversations-stats'] });
    });
  });
});