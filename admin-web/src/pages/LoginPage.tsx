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
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="login-page">
      <section className="login-card" aria-label="Đăng nhập Koola Admin">
        <div className="login-hero">
          <div className="admin-brand" style={{ marginBottom: 'var(--space-7)' }}>
            <div className="admin-brand-mark" aria-hidden="true">
              K
            </div>
            <div>
              <div className="admin-brand-title">Koola Admin</div>
              <div className="admin-brand-subtitle" style={{ color: 'rgba(255,255,255,0.72)' }}>
                Operations console
              </div>
            </div>
          </div>
          <h1>Điều hành Koola gọn, rõ và an toàn.</h1>
          <p>
            Duyệt doanh nghiệp, kiểm soát tài khoản và theo dõi trạng thái vận hành từ một bề mặt quản trị tập trung.
          </p>
        </div>

        <div className="login-form-panel">
          <div className="page-eyebrow">Admin access</div>
          <h2 className="panel-title">Đăng nhập quản trị</h2>
          <p className="panel-subtitle">
            Dùng tài khoản có quyền admin để tiếp tục.
          </p>

          <form className="login-form" onSubmit={handleSubmit} aria-label="Đăng nhập quản trị">
            <div className="form-field">
              <label className="form-label" htmlFor="email">
                Email
              </label>
              <input
                className="input"
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder="admin@koola.app"
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="password">
                Mật khẩu
              </label>
              <div className="password-row">
                <input
                  className="input"
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                />
                <button
                  className="btn btn-ghost btn-sm password-toggle"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
            </div>

            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
