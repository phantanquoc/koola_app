/**
 * AppLayout (app-shell, DESIGN.md §8) tests: env banner DEV/PROD,
 * active nav link, identity chip, logout.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppLayout from '../AppLayout';

const envState = vi.hoisted(() => ({ appEnv: 'development' }));
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

function renderShell(initialPath = '/') {
  return render(
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
          createElement(Route, { path: 'audit-logs', element: createElement('div', null, 'audit') }),
        ),
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  envState.appEnv = 'development';
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
    const dashboard = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboard.className).toContain('active');
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

    // Confirm trước, Hủy sau (mở dialog là Enter chốt luôn)
    const dialogButtons = screen
      .getByRole('dialog')
      .querySelectorAll('button');
    const dialogLabels = Array.from(dialogButtons).map((b) => b.textContent);
    expect(dialogLabels.indexOf('Đăng xuất')).toBeLessThan(dialogLabels.indexOf('Hủy'));

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
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(15);
    for (const link of links) {
      expect(link.querySelector('svg')).toBeTruthy();
      expect(link.textContent).not.toMatch(/[◎◈◫✉⬢♫⚑▣◧⬣◌♥☄≡]/);
    }
    expect(container.querySelector('.admin-brand-logo')).toBeTruthy();
    expect(container.querySelector('.admin-brand-logo')?.getAttribute('src')).toBe('/koola-mark.png');
    expect(screen.getByText('Koola Admin')).toBeTruthy();
    // active state lands on the visited route, not the home route
    expect(screen.getByRole('link', { name: /người dùng/i }).className).toContain('active');
    expect(screen.getByRole('link', { name: /dashboard/i }).className).not.toContain('active');
  });

  it('shows breadcrumb with current route title, no topbar title', () => {
    renderShell('/users');
    const nav = screen.getByRole('navigation', { name: 'Vị trí hiện tại' });
    expect(nav.textContent).toContain('Koola');
    expect(nav.textContent).toContain('Quản lý người dùng');
    expect(document.querySelector('.admin-topbar-title')).toBeNull();
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
    expect(screen.getByRole('option', { name: 'Audit log' })).toBeTruthy();
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
});
