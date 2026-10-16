/**
 * LoginPage tests: renders via i18n (vi default), submits email+password
 * to POST /auth/login, verifies /admin/me before committing the session.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import apiClient from '../apiClient';
import LoginPage from '../pages/LoginPage';
import { AuthProvider } from '../AuthContext';
import { ToastProvider } from '../components/Toast';
import { tokenStorage } from '../tokenStorage';
import '../i18n';

vi.mock('../apiClient', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    defaults: { baseURL: 'http://localhost:3000/api' },
  },
}));

const mockedPost = vi.mocked(apiClient.post);
const mockedGet = vi.mocked(apiClient.get);

function renderLogin() {
  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(AuthProvider, null, createElement(ToastProvider, null, createElement(LoginPage))),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(axios, 'get').mockResolvedValue({ data: { email: 'a@koola.app' } });
  // Default /admin/me probe (triggered by AuthProvider after login commits).
  mockedGet.mockResolvedValue({ data: { email: 'a@koola.app' } } as never);
});

describe('LoginPage', () => {
  it('renders Vietnamese labels by default', () => {
    renderLogin();
    expect(screen.getByText('Đăng nhập quản trị')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeTruthy();
  });

  it('commits the rotated token pair after /admin/me passes', async () => {
    mockedPost.mockResolvedValueOnce({
      data: { accessToken: 'a1', refreshToken: 'r1' },
    });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@koola.app' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(tokenStorage.getAccess()).toBe('a1');
    });
    expect(tokenStorage.getRefresh()).toBe('r1');
  });

  it('shows inline error and stores nothing when /admin/me is 403', async () => {
    mockedPost.mockResolvedValueOnce({
      data: { accessToken: 'a1', refreshToken: 'r1' },
    });
    const err = new axios.AxiosError('Forbidden');
    err.response = { status: 403, data: {}, statusText: '', headers: {}, config: {} as never };
    (axios.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);
    renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@koola.app' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(screen.getByText('Bạn không có quyền quản trị (không có quyền admin).')).toBeTruthy();
    });
    expect(tokenStorage.getAccess()).toBeNull();
  });
});
