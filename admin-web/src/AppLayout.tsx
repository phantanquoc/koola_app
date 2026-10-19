import { useState, useCallback, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Briefcase,
  Building2,
  Camera,
  ChartLine,
  ChevronsLeft,
  ChevronsRight,
  Flag,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  MessageSquareText,
  Music,
  Package,
  ScrollText,
  Search,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem('koola-admin:sidebar-collapsed') === '1',
  );
  const [topSearch, setTopSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      window.localStorage.setItem('koola-admin:sidebar-collapsed', prev ? '0' : '1');
      return !prev;
    });
  }, []);

  // Press "/" anywhere (outside inputs) to focus global search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const adminName = identity?.name ?? 'Admin';
  const adminInitial = initials(adminName, 'A');
  const isProd = config.appEnv === 'production';
  // Drawer mobile luôn render full — collapsed rail chỉ áp dụng desktop.
  const effectiveCollapsed = sidebarCollapsed && !mobileNavOpen;

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
        className={`admin-sidebar${mobileNavOpen ? ' admin-sidebar--open' : ''}${effectiveCollapsed ? ' admin-sidebar--collapsed' : ''}`}
        aria-label="Admin navigation"
      >
        <div className="admin-brand">
          <img
            className="admin-brand-logo"
            src={effectiveCollapsed ? '/koola-mark.png' : '/koola-logo.png'}
            alt="Koola"
            width={effectiveCollapsed ? 40 : 104}
          />
        </div>

        <nav className="admin-nav">
          {navGroups.map((group) => (
            <section className="admin-nav-section" key={group.label}>
              {!effectiveCollapsed && <p className="admin-nav-label">{group.label}</p>}
              {group.items.map((item) => (
                <NavLink
                  className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
                  end={item.end}
                  key={item.to}
                  to={item.to}
                  onClick={closeMobileNav}
                  title={effectiveCollapsed ? item.label : undefined}
                >
                  <span className="admin-nav-icon" aria-hidden="true">
                    <item.icon size={18} strokeWidth={1.75} aria-hidden />
                  </span>
                  {!effectiveCollapsed && <span>{item.label}</span>}
                </NavLink>
              ))}
            </section>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button
            className="btn btn-danger-ghost admin-logout"
            onClick={logout}
            type="button"
            title={effectiveCollapsed ? 'Đăng xuất' : undefined}
          >
            <LogOut size={18} strokeWidth={1.75} aria-hidden />
            {!effectiveCollapsed && 'Đăng xuất'}
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
            <button
              className="btn btn-ghost sidebar-collapse-toggle"
              onClick={toggleSidebar}
              type="button"
              aria-label={sidebarCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? 'Mở rộng (giữ trạng thái)' : 'Thu gọn (giữ trạng thái)'}
            >
              <span aria-hidden="true">
                {sidebarCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
              </span>
            </button>
            <div>
              <div className="admin-breadcrumb">Koola / Admin</div>
              <div className="admin-topbar-title">{currentTitle}</div>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <form onSubmit={handleTopSearch} className="admin-topbar-search" role="search" aria-label="Tìm kiếm admin">
              <Search size={18} strokeWidth={1.75} aria-hidden className="admin-search-icon" />
              <input
                ref={searchRef}
                className="input admin-search-input"
                placeholder="Tìm users, messages..."
                value={topSearch}
                onChange={(e) => setTopSearch(e.target.value)}
                aria-label="Tìm kiếm"
              />
              <kbd className="admin-search-kbd" aria-hidden="true">/</kbd>
            </form>
            <span className="admin-topbar-divider" aria-hidden="true" />
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
