import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import apiClient from '../apiClient';
import { useAuth } from '../useAuth';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export default function LoginPage() {
  const { t } = useTranslation();
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
      // Step 1: authenticate — backend returns the rotated token pair.
      const loginRes = await apiClient.post<LoginResponse>(
        '/auth/login',
        { email, password },
      );
      const { accessToken, refreshToken } = loginRes.data;

      // Step 2: confirm admin identity BEFORE committing to auth state.
      // Pass the token explicitly — do not touch tokenStorage until /me passes,
      // so a non-admin never leaves a stray token behind.
      try {
        await axios.get(`${apiClient.defaults.baseURL}/admin/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch (meErr) {
        if (axios.isAxiosError(meErr) && meErr.response?.status === 403) {
          setError(t('login.notAdmin'));
          setLoading(false);
          return;
        }
        throw meErr;
      }

      // Both checks passed — commit session and go to dashboard.
      login(accessToken, refreshToken);
      navigate('/');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 401) {
          setError(t('login.invalidCredentials'));
        } else if (status === 403) {
          setError(t('login.locked'));
        } else {
          setError(t('login.genericError'));
        }
      } else {
        setError(t('login.networkError'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-label={t('login.title')}>
        <div className="login-hero">
          <div className="admin-brand" style={{ marginBottom: 'var(--space-7)' }}>
            <img
              className="admin-brand-logo"
              src="/koola-logo.png"
              alt="Koola"
              width={140}
            />
          </div>
          <h1>{t('login.heroTitle')}</h1>
          <p>{t('login.heroCopy')}</p>
        </div>

        <div className="login-form-panel">
          <div className="page-eyebrow">{t('login.eyebrow')}</div>
          <h2 className="panel-title">{t('login.title')}</h2>
          <p className="panel-subtitle">{t('login.subtitle')}</p>

          <form className="login-form" onSubmit={handleSubmit} aria-label={t('login.title')}>
            <div className="form-field">
              <label className="form-label" htmlFor="email">
                {t('login.email')}
              </label>
              <input
                className="input"
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder={t('login.emailPlaceholder')}
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="password">
                {t('login.password')}
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
                  placeholder={t('login.passwordPlaceholder')}
                />
                <button
                  className="btn btn-ghost btn-sm password-toggle"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? t('login.hidePasswordLabel') : t('login.showPasswordLabel')}
                >
                  {showPassword ? t('login.hidePassword') : t('login.showPassword')}
                </button>
              </div>
            </div>

            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
