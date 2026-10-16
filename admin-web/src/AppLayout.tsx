import { useState, useCallback } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Briefcase,
  Building2,
  Camera,
  ChartLine,
  Flag,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  MessageSquareText,
  MessagesSquare,
  Music,
  Package,
  ScrollText,
  ShoppingCart,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from './useAuth';
import { config } from './config';
import { initials } from './components/formatters';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Tổng quan',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/analytics', label: 'Analytics', icon: ChartLine },
    ],
  },
  {
    label: 'Kiểm duyệt',
    items: [
      { to: '/conversations', label: 'Conversations', icon: MessageSquareText },
      { to: '/messages', label: 'Messages', icon: Mail },
      { to: '/moments', label: 'Moments', icon: Camera },
      { to: '/music', label: 'Music', icon: Music },
      { to: '/reports', label: 'Reports', icon: Flag },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/products', label: 'Products', icon: Package },
      { to: '/orders', label: 'Orders', icon: ShoppingCart },
      { to: '/services', label: 'Services', icon: Briefcase },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      { to: '/businesses', label: 'Doanh nghiệp', icon: Building2 },
      { to: '/users', label: 'Người dùng', icon: Users },
      { to: '/health', label: 'Health', icon: Activity },
      { to: '/broadcast', label: 'Broadcast', icon: Megaphone },
      { to: '/audit-logs', label: 'Audit log', icon: ScrollText },
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
  '/orders': 'Đơn hàng',
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
  const isProd = config.appEnv === 'production';

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
      <div className={`env-banner ${isProd ? 'env-banner--prod' : 'env-banner--dev'}`} role="status">
        {isProd ? 'PROD · Koola Admin' : 'DEV · Koola Admin'}
      </div>
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

      <div className="admin-shell-body">

      <aside
        className={`admin-sidebar ${mobileNavOpen ? 'admin-sidebar--open' : ''}`}
        aria-label="Admin navigation"
      >
        <div className="admin-brand">
          <div className="admin-brand-mark" aria-hidden="true">
            <MessagesSquare size={22} strokeWidth={1.75} />
          </div>
          <div>
            <div className="admin-brand-title">Koola Admin</div>
            <div className="admin-brand-subtitle">Operations console</div>
          </div>
        </div>

        <nav className="admin-nav">
          {navGroups.map((group) => (
            <section className="admin-nav-section" key={group.label}>
              <p className="admin-nav-label">{group.label}</p>
              {group.items.map((item) => (
                <NavLink
                  className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
                  end={item.end}
                  key={item.to}
                  to={item.to}
                  onClick={closeMobileNav}
                >
                  <span className="admin-nav-icon" aria-hidden="true">
                    <item.icon size={18} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </section>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button className="btn btn-danger-ghost admin-logout" onClick={logout} type="button">
            <LogOut size={18} strokeWidth={1.75} aria-hidden />
            Đăng xuất
          </button>
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
              <span aria-hidden="true">{mobileNavOpen ? <X size={18} /> : <Menu size={18} />}</span>
            </button>
            <div>
              <div className="admin-breadcrumb">Koola / Admin</div>
              <div className="admin-topbar-title">{currentTitle}</div>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <form onSubmit={handleTopSearch} className="admin-topbar-search" role="search" aria-label="Tìm kiếm admin">
              <input
                className="input"
                placeholder="Tìm users/messages..."
                value={topSearch}
                onChange={(e) => setTopSearch(e.target.value)}
                aria-label="Tìm kiếm"
              />
              <button className="btn btn-secondary btn-sm" type="submit" aria-label="Tìm kiếm">Tìm</button>
            </form>
            <div className="admin-identity-chip">
              <div className="admin-avatar" aria-hidden="true">
                {adminInitial}
              </div>
              <div className="admin-identity-text">
                <div className="cell-title">{adminName}</div>
                <div className="cell-meta">{identity?.email ?? 'platform admin'}</div>
              </div>
              <span className="badge badge-primary">admin</span>
            </div>
          </div>
        </header>

        <div className="admin-content-scroll">
          <main className="admin-content">
            <Outlet />
          </main>
        </div>
      </div>
      </div>
    </div>
  );
}
