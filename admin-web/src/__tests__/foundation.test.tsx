/**
 * ErrorBoundary + ForbiddenPage tests: crash → retry screen,
 * /forbidden shows demote copy with dashboard-back (no login loop).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider } from '../components/Toast';
import ForbiddenPage from '../pages/ForbiddenPage';
import { AuthProvider } from '../AuthContext';
import '../i18n';

function Boom(): React.JSX.Element {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders the retry screen when a child crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Đã xảy ra sự cố')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tải lại trang' })).toBeTruthy();
    (console.error as ReturnType<typeof vi.fn>).mockRestore();
  });
});

describe('ForbiddenPage', () => {
  it('shows demote copy with dashboard-back and explicit sign-out', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <ForbiddenPage />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getAllByText('Tài khoản đã bị hạ quyền').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Về dashboard' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeTruthy();
  });
});
