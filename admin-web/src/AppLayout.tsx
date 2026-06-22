import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

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
  const { logout } = useAuth();
  const location = useLocation();
  const currentTitle = routeTitles[location.pathname] ?? 'Koola Admin';

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Điều hướng quản trị">
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
                A
              </div>
              <div>
                <div className="cell-title">Admin</div>
                <div className="cell-meta">Phiên quản trị an toàn</div>
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
          <div>
            <div className="admin-breadcrumb">Koola / Admin</div>
            <strong>{currentTitle}</strong>
          </div>
          <div className="admin-topbar-actions">
            <div className="admin-command" aria-label="Tìm nhanh trong admin">
              <span>Search users, businesses...</span>
              <kbd>⌘K</kbd>
            </div>
            <span className="badge badge-success">Live</span>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
