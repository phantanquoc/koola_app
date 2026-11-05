import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import StateBlock from '../components/StateBlock';
import { useAuth } from '../useAuth';

/**
 * 403-demote screen (DESIGN.md §10): StateBlock + "back to dashboard" button.
 * No re-login button — the session may still be valid, only admin rights
 * were revoked. Reached via the apiClient 403 interceptor, never /login.
 */
export default function ForbiddenPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  function handleLogout(): void {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow={t('forbidden.eyebrow')} title={t('forbidden.title')} />
      <StateBlock variant="empty" icon="!" title={t('forbidden.title')} copy={t('forbidden.copy')}>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/')}>
            {t('forbidden.backHome')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
            {t('forbidden.switchAccount')}
          </button>
        </div>
      </StateBlock>
    </div>
  );
}
