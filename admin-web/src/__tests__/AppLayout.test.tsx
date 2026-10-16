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
    expect(container.querySelector('.admin-brand-mark svg')).toBeTruthy();
    // active state lands on the visited route, not the home route
    expect(screen.getByRole('link', { name: /người dùng/i }).className).toContain('active');
    expect(screen.getByRole('link', { name: /dashboard/i }).className).not.toContain('active');
  });
});
