import { useState, useCallback } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { initials } from './components/formatters';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Tổng quan',
    items: [
      { to: '/', label: 'Dashboard', icon: '◎', end: true },
      { to: '/analytics', label: 'Analytics', icon: '◈' },
    ],
  },
  {
    label: 'Kiểm duyệt',
    items: [
      { to: '/conversations', label: 'Conversations', icon: '◫' },
      { to: '/messages', label: 'Messages', icon: '✉' },
      { to: '/moments', label: 'Moments', icon: '⬢' },
      { to: '/music', label: 'Music', icon: '♫' },
      { to: '/reports', label: 'Reports', icon: '⚑' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/products', label: 'Products', icon: '▣' },
      { to: '/services', label: 'Services', icon: '⬣' },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      { to: '/businesses', label: 'Doanh nghiệp', icon: '▣' },
      { to: '/users', label: 'Người dùng', icon: '◌' },
      { to: '/health', label: 'Health', icon: '♥' },
      { to: '/broadcast', label: 'Broadcast', icon: '☄' },
      { to: '/audit-logs', label: 'Audit log', icon: '≡' },
    ],
  },
];

const routeTitles: Record<string, string> = {
  '/': 'Tổng quan vận hành',
  '/analytics': 'Analytics',
  '/businesses': 'Doanh nghiệp chờ duyệt',
  '/users': 'Quản lý người dùng',
  '/conversations': 'Hội thoại',
  '/messages': 'Tin nhắn',
  '/moments': 'Moments',
  '/music': 'Music catalog',
  '/reports': 'Báo cáo',
  '/products': 'Sản phẩm',
  '/services': 'Dịch vụ',
  '/health': 'Sức khỏe hệ thống',
  '/broadcast': 'Broadcast',
  '/audit-logs': 'Audit log',
};

export default function AppLayout() {
  const { logout, identity } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currentTitle = routeTitles[location.pathname] ?? 'Koola Admin';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [topSearch, setTopSearch] = useState('');

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  const adminName = identity?.name ?? 'Admin';
  const adminInitial = initials(adminName, 'A');
  const adminRole = identity?.role ?? 'admin';

  function handleTopSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = topSearch.trim();
    if (!q) return;
    // Heuristic: if q looks like email/phone, go to users; else messages search
    if (q.includes('@') || /^[0-9+]+$/.test(q)) {
      navigate(`/users?search=${encodeURIComponent(q)}`);
    } else {
      navigate(`/messages?q=${encodeURIComponent(q)}`);
    }
    setTopSearch('');
  }

  return (
    <div className="admin-shell">
      {mobileNavOpen && (
        <div
          className="mobile-nav-backdrop"
          onClick={closeMobileNav}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeMobileNav();
          }}
          role="presentation"
        />
      )}

      <aside
        className={`admin-sidebar ${mobileNavOpen ? 'admin-sidebar--open' : ''}`}
        aria-label="Admin navigation"
      >
        <div className="admin-brand">
          <div className="admin-brand-mark" aria-hidden="true">
            K
          </div>
          <div>
            <div className="admin-brand-title">Koola Admin</div>
            <div className="admin-brand-subtitle">Operations console</div>
          </div>
        </div>

        <nav>
          {navGroups.map((group) => (
            <section className="admin-nav-section" key={group.label}>
              <p className="admin-nav-label">{group.label}</p>
              {group.items.map((item) => (
                <NavLink
                  className="admin-nav-link"
                  end={item.end}
                  key={item.to}
                  to={item.to}
                  onClick={closeMobileNav}
                >
                  <span className="admin-nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </section>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-profile-card">
            <div className="admin-profile-row">
              <div className="admin-avatar" aria-hidden="true">
                {adminInitial}
              </div>
              <div>
                <div className="cell-title">{adminName}</div>
                <div className="cell-meta">{adminRole}</div>
              </div>
            </div>
            <button className="btn btn-secondary" onClick={logout} type="button">
              Đăng xuất
            </button>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              className="btn btn-ghost mobile-nav-toggle"
              onClick={() => setMobileNavOpen((v) => !v)}
              type="button"
              aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={mobileNavOpen}
            >
              <span aria-hidden="true">{mobileNavOpen ? '✕' : '☰'}</span>
            </button>
            <div>
              <div className="admin-breadcrumb">Koola / Admin</div>
              <strong>{currentTitle}</strong>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <form onSubmit={handleTopSearch} style={{ display: 'flex', gap: 'var(--space-2)' }} role="search" aria-label="Tìm kiếm admin">
              <input
                className="input"
                placeholder="Tìm users/messages..."
                value={topSearch}
                onChange={(e) => setTopSearch(e.target.value)}
                aria-label="Tìm kiếm"
                style={{ width: 220 }}
              />
              <button className="btn btn-secondary btn-sm" type="submit" aria-label="Tìm kiếm">Tìm</button>
            </form>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
