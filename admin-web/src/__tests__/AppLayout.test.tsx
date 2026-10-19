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

  it('renders the identity chip with name, email and admin badge', () => {
    renderShell();
    expect(screen.getByText('Test Admin')).toBeTruthy();
    expect(screen.getByText('admin@koola.app')).toBeTruthy();
    expect(screen.getByText('admin')).toBeTruthy();
  });

  it('calls logout when the sign-out button is clicked', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
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
    expect(container.querySelector('.admin-brand-logo')?.getAttribute('src')).toBe('/koola-logo.png');
    // active state lands on the visited route, not the home route
    expect(screen.getByRole('link', { name: /người dùng/i }).className).toContain('active');
    expect(screen.getByRole('link', { name: /dashboard/i }).className).not.toContain('active');
  });
});

describe('AppLayout topbar search', () => {
  it('renders pill search with icon and slash hint, no submit button', () => {
    renderShell();
    const search = screen.getByRole('search');
    expect(search.className).toContain('admin-topbar-search');
    expect(search.querySelector('svg')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tìm kiếm' })).toBeNull();
  });

  it('focuses search when pressing slash outside inputs', () => {
    renderShell();
    const input = screen.getByLabelText('Tìm kiếm') as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(input);
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
    expect(screen.getByAltText('Koola').getAttribute('src')).toBe('/koola-mark.png');

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
