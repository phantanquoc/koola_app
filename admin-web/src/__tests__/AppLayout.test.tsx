/**
 * AppLayout (app-shell, DESIGN.md §8) tests: env banner DEV/PROD,
 * active nav link, identity chip, logout.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppLayout from '../AppLayout';

const envState = vi.hoisted(() => ({ appEnv: 'development', pending: 0 }));
const authState = vi.hoisted(() => ({
  identity: { name: 'Test Admin', email: 'admin@koola.app' } as { name: string; email: string } | null,
  logout: vi.fn(),
}));

vi.mock('../config', () => ({
  config: {
    get appEnv() {
      return envState.appEnv;
    },
    apiUrl: 'http://localhost:3000/api',
  },
}));

vi.mock('../useAuth', () => ({
  useAuth: () => ({
    token: 't',
    isAuthenticated: true,
    identity: authState.identity,
    identityLoading: false,
    login: vi.fn(),
    logout: authState.logout,
  }),
}));

// Topbar poll sức khỏe + sidebar đọc stats. Mặc định 'ok'/0 để badge không
// render; test nào cần badge thì đặt envState.pending.
vi.mock('../apiClient', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        data:
          url === '/admin/stats'
            ? { pendingVerification: envState.pending }
            : { status: 'ok' },
      }),
    ),
  },
}));

/** Sidebar đọc `/admin/stats` (badge việc chờ) → mỗi test cần một QueryClient mới. */
function renderShell(initialPath = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        { initialEntries: [initialPath] },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            { element: createElement(AppLayout) },
            createElement(Route, { index: true, element: createElement('div', null, 'home') }),
            createElement(Route, { path: 'users', element: createElement('div', null, 'users') }),
            createElement(Route, { path: 'users/:id', element: createElement('div', null, 'user') }),
            createElement(Route, { path: 'audit-logs', element: createElement('div', null, 'audit') }),
          ),
        ),
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  envState.appEnv = 'development';
  envState.pending = 0;
  authState.identity = { name: 'Test Admin', email: 'admin@koola.app' };
});

describe('AppLayout env banner', () => {
  it('shows the DEV banner by default', () => {
    renderShell();
    const banner = screen.getByRole('status');
    expect(banner.className).toContain('env-banner--dev');
    expect(banner.textContent).toContain('DEV');
  });

  it('shows the PROD banner with PROD prefix in production', () => {
    envState.appEnv = 'production';
    renderShell();
    const banner = screen.getByRole('status');
    expect(banner.className).toContain('env-banner--prod');
    expect(banner.textContent).toContain('PROD');
  });
});

describe('AppLayout sidebar + identity', () => {
  it('marks the current route link as active', () => {
    renderShell('/');
    const home = screen.getByRole('link', { name: /tổng quan/i });
    expect(home.className).toContain('active');
  });

  it('renders the identity chip with name and email, no role badge', () => {
    renderShell();
    expect(screen.getByText('Test Admin')).toBeTruthy();
    expect(screen.getByText('admin@koola.app')).toBeTruthy();
    expect(screen.queryByText('admin')).toBeNull();
  });

  it('asks for confirm with identity preview before logout', () => {
    renderShell();
    const sidebarLogout = screen.getByRole('button', { name: 'Đăng xuất' });
    expect(sidebarLogout.className).toContain('admin-logout');

    fireEvent.click(sidebarLogout);
    // logout chưa chạy ngay — hiện dialog preview identity
    expect(authState.logout).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Đăng xuất khỏi Koola Admin?' })).toBeTruthy();
    // preview hiện identity (chip topbar + dialog preview đều có tên)
    expect(screen.getAllByText('Test Admin').length).toBeGreaterThanOrEqual(2);

    // Hủy trước, hành động chính sau — focus mặc định không rơi vào nút nguy hiểm
    const dialogButtons = screen
      .getByRole('dialog')
      .querySelectorAll('button');
    const dialogLabels = Array.from(dialogButtons).map((b) => b.textContent);
    expect(dialogLabels.indexOf('Hủy')).toBeLessThan(dialogLabels.indexOf('Đăng xuất'));

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(authState.logout).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Đăng xuất khỏi Koola Admin?' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    const confirmBtn = screen
      .getByRole('dialog')
      .querySelectorAll('button');
    fireEvent.click(
      Array.from(confirmBtn).find((b) => b.textContent === 'Đăng xuất')!,
    );
    expect(authState.logout).toHaveBeenCalledTimes(1);
  });

  it('renders the logout button full-width at 44px without confirm', () => {
    renderShell();
    const btn = screen.getByRole('button', { name: 'Đăng xuất' }) as HTMLButtonElement;
    expect(btn.className).toContain('admin-logout');
    expect(btn.type).toBe('button');
  });

  it('renders lucide svg icons for every nav link, none decorative chars', () => {
    const { container } = renderShell('/users');
    // Skip link là <a> đầu shell (không icon) — đếm riêng link trong sidebar.
    expect(screen.getByRole('link', { name: 'Bỏ qua tới nội dung' })).toBeTruthy();
    const links = Array.from(container.querySelectorAll('.admin-nav a'));
    // 21 = tổng items trong navGroups; đổi nav thì cập nhật số này.
    expect(links.length).toBe(21);
    for (const link of links) {
      expect(link.querySelector('svg')).toBeTruthy();
      expect(link.textContent).not.toMatch(/[◎◈◫✉⬢♫⚑▣◧⬣◌♥☄≡]/);
    }
    expect(container.querySelector('.admin-brand-logo')).toBeTruthy();
    expect(container.querySelector('.admin-brand-logo')?.getAttribute('src')).toBe('/koola-mark.png');
    expect(screen.getByText('Koola Admin')).toBeTruthy();
    // active state lands on the visited route, not the home route
    expect(screen.getByRole('link', { name: /người dùng/i }).className).toContain('active');
    expect(screen.getByRole('link', { name: /tổng quan/i }).className).not.toContain('active');
  });

  it('shows breadcrumb matching the page title, no topbar title', () => {
    renderShell('/users');
    const nav = screen.getByRole('navigation', { name: 'Vị trí hiện tại' });
    expect(nav.textContent).toContain('Koola');
    // Breadcrumb và H1 phải cùng một câu — trước đây breadcrumb ghi
    // "Quản lý người dùng" trong khi trang ghi "Người dùng".
    expect(nav.textContent).toContain('Người dùng');
    expect(nav.textContent).not.toContain('Quản lý người dùng');
    expect(document.querySelector('.admin-topbar-title')).toBeNull();
  });

  it('scrolls the active nav item into view on route change', () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    renderShell('/users');
    expect(spy).toHaveBeenCalled();
    const target = spy.mock.contexts.at(-1) as Element | undefined;
    expect(target?.textContent).toContain('Người dùng');
  });

  it('renders collapse as a floating tab on the sidebar edge, not in the footer', () => {
    renderShell();
    const toggle = screen.getByRole('button', { name: 'Thu gọn sidebar' });
    expect(toggle.className).toContain('admin-edge-toggle');
    expect(toggle.closest('.admin-sidebar-footer')).toBeNull();
    expect(toggle.closest('.admin-sidebar')).toBeTruthy();
  });
});

describe('AppLayout topbar search', () => {
  it('renders palette trigger with slash hint, no submit button', () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Mở tìm kiếm chức năng' });
    expect(trigger.className).toContain('admin-palette-trigger');
    expect(trigger.querySelector('svg')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tìm kiếm' })).toBeNull();
  });

  it('opens palette when pressing slash outside inputs', () => {
    renderShell();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: '/' });
    expect(screen.getByRole('dialog', { name: 'Tìm kiếm chức năng' })).toBeTruthy();
  });

  it('opens palette with Cmd+K and navigates to a route on Enter', () => {
    renderShell('/');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const input = screen.getByLabelText('Ô nhập tìm kiếm chức năng') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'audit' } });
    // Nhãn đã Việt hoá; "audit" vẫn phải khớp nhờ keywords.
    expect(screen.getByRole('option', { name: 'Nhật ký thao tác' })).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('audit')).toBeTruthy();
  });

  it('matches Vietnamese without diacritics', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Mở tìm kiếm chức năng' }));
    const input = screen.getByLabelText('Ô nhập tìm kiếm chức năng');
    fireEvent.change(input, { target: { value: 'doanh nghiep' } });
    expect(screen.getByRole('option', { name: 'Doanh nghiệp' })).toBeTruthy();
  });

  it('offers data search fallback for free text', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Mở tìm kiếm chức năng' }));
    const input = screen.getByLabelText('Ô nhập tìm kiếm chức năng');
    fireEvent.change(input, { target: { value: 'hello xyz' } });
    expect(screen.getByRole('option', { name: /Tìm tin nhắn: hello xyz/ })).toBeTruthy();
  });
});

describe('AppLayout sidebar collapse', () => {
  it('toggles collapsed rail and persists state in localStorage', () => {
    window.localStorage.clear();
    renderShell();
    const toggle = screen.getByRole('button', { name: 'Thu gọn sidebar' });
    expect(document.querySelector('.admin-sidebar--collapsed')).toBeNull();

    fireEvent.click(toggle);
    expect(document.querySelector('.admin-sidebar--collapsed')).toBeTruthy();
    expect(window.localStorage.getItem('koola-admin:sidebar-collapsed')).toBe('1');
    expect(screen.getByRole('button', { name: 'Mở rộng sidebar' })).toBeTruthy();
    // collapsed rail keeps the single mark logo; brand name hides
    expect(screen.getByAltText('Koola').getAttribute('src')).toBe('/koola-mark.png');
    expect(screen.queryByText('Koola Admin')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mở rộng sidebar' }));
    expect(document.querySelector('.admin-sidebar--collapsed')).toBeNull();
    expect(window.localStorage.getItem('koola-admin:sidebar-collapsed')).toBe('0');
  });

  it('restores collapsed state from localStorage on mount', () => {
    window.localStorage.setItem('koola-admin:sidebar-collapsed', '1');
    renderShell();
    expect(document.querySelector('.admin-sidebar--collapsed')).toBeTruthy();
    window.localStorage.clear();
  });

  it('shows pending-verification badge on the businesses link', async () => {
    envState.pending = 7;
    renderShell();
    const link = document.querySelector('.admin-nav-link[href="/businesses"]') as HTMLElement;
    expect(link.textContent).toContain('Doanh nghiệp');
    // Stats đến từ query bất đồng bộ.
    expect(await screen.findByText('7')).toBeTruthy();
    expect(link.querySelector('.admin-nav-badge')?.textContent).toBe('7');
  });

  it('hides the badge when nothing is pending — a "0" badge is noise', () => {
    envState.pending = 0;
    renderShell();
    expect(document.querySelector('.admin-nav-badge')).toBeNull();
    expect(document.querySelector('.admin-nav-dot')).toBeNull();
  });
});
