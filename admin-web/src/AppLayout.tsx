import { useState, useCallback, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  Banknote,
  Briefcase,
  Building2,
  Camera,
  ChartLine,
  ChevronsLeft,
  ChevronsRight,
  FileClock,
  Flag,
  Gavel,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  MessageSquareText,
  Music,
  Package,
  ScrollText,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from './useAuth';
import { config } from './config';
import apiClient from './apiClient';
import { initials } from './components/formatters';
import CommandPalette, { type PaletteCommand } from './components/CommandPalette';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ImpersonationBar } from './components/ImpersonationBar';

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
      { to: '/reports', label: 'Reports', icon: Flag },
      { to: '/conversations', label: 'Conversations', icon: MessageSquareText },
      { to: '/messages', label: 'Messages', icon: MessageSquare },
      { to: '/moments', label: 'Moments', icon: Camera },
      { to: '/music', label: 'Music', icon: Music },
      { to: '/moderation-queue', label: 'Hàng đợi', icon: ListChecks },
      { to: '/appeals', label: 'Appeal', icon: Gavel },
    ],
  },
  {
    label: 'Người dùng',
    items: [
      { to: '/businesses', label: 'Doanh nghiệp', icon: Building2 },
      { to: '/users', label: 'Người dùng', icon: Users },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/products', label: 'Products', icon: Package },
      { to: '/orders', label: 'Orders', icon: ShoppingCart },
      { to: '/services', label: 'Services', icon: Briefcase },
      { to: '/revenue', label: 'Doanh thu', icon: Banknote },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { to: '/health', label: 'Health', icon: Activity },
      { to: '/ratelimit', label: 'Rate limit', icon: ShieldAlert },
      { to: '/ops-logs', label: 'Nhật ký vận hành', icon: FileClock },
      { to: '/config', label: 'Cấu hình', icon: Settings },
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
  '/ratelimit': 'Rate limit',
  '/broadcast': 'Broadcast',
  '/audit-logs': 'Audit log',
  '/moderation-queue': 'Hàng đợi kiểm duyệt',
  '/appeals': 'Kháng nghị',
  '/ops-logs': 'Nhật ký vận hành',
  '/config': 'Cấu hình hệ thống',
  '/revenue': 'Doanh thu',
};

/**
 * Title cho breadcrumb. Route con (`/audit-logs/:id`, `/businesses/:id`) không
 * có trong map, nên fallback theo prefix gần nhất thay vì rơi về "Koola Admin" —
 * người dùng mất dấu mình đang ở đâu.
 */
function breadcrumbTitle(pathname: string): string {
  if (routeTitles[pathname]) return routeTitles[pathname];
  const parent = Object.keys(routeTitles)
    .filter((p) => p !== '/' && pathname.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
  return parent ? routeTitles[parent] : 'Koola Admin';
}

/**
 * Health badge state cho topbar: poll 60s, chỉ hiện khi hệ thống != ok.
 * Không dùng TanStack Query vì AppLayout còn được render ngoài provider trong
 * test shell; effect + AbortController theo style của HealthPage.
 */
function useHealthStatus(): string | null {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let controller: AbortController | null = null;
    let stopped = false;

    async function poll() {
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await apiClient.get<{ status?: string }>('/admin/health', {
          signal: controller.signal,
        });
        if (stopped) return;
        // 'ok' (hoặc payload lạ) → không render gì; degraded/error → badge.
        const s = res.data?.status;
        setStatus(s && s !== 'ok' ? s : null);
      } catch {
        // Lỗi mạng/401/429: giữ trạng thái cũ — badge không phải kênh báo lỗi.
      }
    }

    void poll();
    // ponytail: 60s đủ cho tín hiệu vận hành; realtime là việc của /health page.
    const id = window.setInterval(() => void poll(), 60_000);
    return () => {
      stopped = true;
      window.clearInterval(id);
      controller?.abort();
    };
  }, []);

  return status;
}

export default function AppLayout() {
  const { logout, identity, identityLoading } = useAuth();
  const location = useLocation();
  const currentTitle = breadcrumbTitle(location.pathname);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem('koola-admin:sidebar-collapsed') === '1',
  );

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      window.localStorage.setItem('koola-admin:sidebar-collapsed', prev ? '0' : '1');
      return !prev;
    });
  }, []);

  // Palette nguồn duy nhất: mọi route trong navGroups (label + group + icon).
  const paletteCommands: PaletteCommand[] = navGroups.flatMap((g) =>
    g.items.map((item) => ({ to: item.to, label: item.label, group: g.label, icon: item.icon })),
  );

  const adminName = identity?.name ?? 'Admin';
  const adminInitial = initials(adminName, 'A');
  const isProd = config.appEnv === 'production';
  const healthStatus = useHealthStatus();
  // Drawer mobile luôn render full — collapsed rail chỉ áp dụng desktop.
  const effectiveCollapsed = sidebarCollapsed && !mobileNavOpen;

  return (
    <div className="admin-shell">
      <a href="#admin-content" className="skip-link">
        Bỏ qua tới nội dung
      </a>
      <div className={`env-banner ${isProd ? 'env-banner--prod' : 'env-banner--dev'}`} role="status">
        {isProd ? 'PROD · Koola Admin' : 'DEV · Koola Admin'}
      </div>
      {/* Bar tự render null khi không có phiên xem-thay — không cần cờ ở layout. */}
      <ImpersonationBar />
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
            src="/koola-mark.png"
            alt="Koola"
            width={32}
            height={32}
          />
          {!effectiveCollapsed && <span className="admin-brand-name">Koola Admin</span>}
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
            className="btn btn-ghost admin-logout"
            onClick={() => setLogoutConfirm(true)}
            type="button"
            title={effectiveCollapsed ? 'Đăng xuất' : undefined}
          >
            <LogOut size={18} strokeWidth={1.75} aria-hidden />
            {!effectiveCollapsed && 'Đăng xuất'}
          </button>
        </div>
        <button
          className="admin-edge-toggle"
          onClick={toggleSidebar}
          type="button"
          aria-label={sidebarCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          <span aria-hidden="true">
            {sidebarCollapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          </span>
        </button>
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
            <nav className="admin-breadcrumb" aria-label="Vị trí hiện tại">
              <span>Koola</span>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{currentTitle}</span>
            </nav>
          </div>
          <div className="admin-topbar-actions">
            {healthStatus && (
              <Link to="/health" className="badge badge-danger admin-health-badge">
                Hệ thống: {healthStatus}
              </Link>
            )}
            <CommandPalette commands={paletteCommands} />
            <span className="admin-topbar-divider" aria-hidden="true" />
            <div className="admin-identity-chip">
              <div className="admin-avatar" aria-hidden="true">
                {adminInitial}
              </div>
              {!identityLoading && (
                <div className="admin-identity-text">
                  <div className="cell-title">{adminName}</div>
                  <div className="cell-meta">{identity?.email ?? 'platform admin'}</div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="admin-content-scroll">
          <main className="admin-content" id="admin-content" tabIndex={-1}>
            <Outlet />
          </main>
        </div>
      </div>
      </div>
      <ConfirmDialog
        open={logoutConfirm}
        onClose={() => setLogoutConfirm(false)}
        title="Đăng xuất khỏi Koola Admin?"
        description="Phiên làm việc hiện tại sẽ kết thúc. Bản nháp và filter chưa lưu có thể mất."
        preview={
          <dl className="description-list">
            <div>
              <dt>Tài khoản</dt>
              <dd>{adminName}</dd>
            </div>
            {identity?.email && (
              <div>
                <dt>Email</dt>
                <dd className="k-mono">{identity.email}</dd>
              </div>
            )}
          </dl>
        }
        confirmLabel="Đăng xuất"
        variant="primary"
        onConfirm={() => {
          setLogoutConfirm(false);
          logout();
        }}
      />
    </div>
  );
}
