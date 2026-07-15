import { useState, useCallback } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
    items: [{ to: '/', label: 'Dashboard', icon: '◎', end: true }],
  },
  {
    label: 'Vận hành',
    items: [
      { to: '/businesses', label: 'Doanh nghiệp', icon: '▣' },
      { to: '/users', label: 'Người dùng', icon: '◌' },
    ],
  },
];

const routeTitles: Record<string, string> = {
  '/': 'Tổng quan vận hành',
  '/businesses': 'Doanh nghiệp chờ duyệt',
  '/users': 'Quản lý người dùng',
};

export default function AppLayout() {
  const { logout, identity } = useAuth();
  const location = useLocation();
  const currentTitle = routeTitles[location.pathname] ?? 'Koola Admin';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  const adminName = identity?.name ?? 'Admin';
  const adminInitial = initials(adminName, 'A');
  const adminRole = identity?.role ?? 'admin';

  return (
    <div className="admin-shell">
      {/* Mobile nav overlay */}
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
            {/* Command affordance rendered as non-interactive info —
                no shortcut claim since search is not yet functional */}
            <span className="admin-command-info" aria-hidden="true">
              Search users, businesses...
            </span>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
