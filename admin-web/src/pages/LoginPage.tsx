import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import apiClient from '../apiClient';
import { useAuth } from '../useAuth';
import { tokenStorage } from '../tokenStorage';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Step 1: authenticate
      const loginRes = await apiClient.post<{ accessToken: string }>(
        '/auth/login',
        { email, password },
      );
      const accessToken = loginRes.data.accessToken;

      // Temporarily store token so the /admin/me call can attach it
      tokenStorage.set(accessToken);

      // Step 2: confirm admin identity
      try {
        await apiClient.get('/admin/me');
      } catch (meErr) {
        // 403 = valid credentials but not an admin
        if (axios.isAxiosError(meErr) && meErr.response?.status === 403) {
          tokenStorage.clear();
          setError('Bạn không có quyền quản trị (không có quyền admin).');
          setLoading(false);
          return;
        }
        throw meErr;
      }

      // Both checks passed — commit to auth state and go to dashboard
      login(accessToken);
      navigate('/');
    } catch (err) {
      tokenStorage.clear();
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 401) {
          setError('Email hoặc mật khẩu không đúng.');
        } else if (status === 403) {
          setError('Tài khoản đã bị khóa hoặc không có quyền truy cập.');
        } else {
          setError('Đã xảy ra lỗi. Vui lòng thử lại.');
        }
      } else {
        setError('Không thể kết nối đến máy chủ.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f4f6f8',
      }}
    >
      <div
        style={{
          background: '#fff',
          padding: '2rem',
          borderRadius: 8,
          boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
          width: 360,
        }}
      >
        <h1 style={{ marginBottom: '1.5rem', fontSize: '1.4rem' }}>
          Koola Admin
        </h1>
        <form onSubmit={handleSubmit} aria-label="Đăng nhập quản trị">
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="email"
              style={{ display: 'block', marginBottom: 4 }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="password"
              style={{ display: 'block', marginBottom: 4 }}
            >
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
            />
          </div>
          {error && (
            <p role="alert" style={{ color: '#c0392b', marginBottom: '1rem' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '0.6rem', cursor: 'pointer' }}
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
