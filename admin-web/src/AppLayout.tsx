import { useState, useCallback, useEffect, useRef } from 'react';
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
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from './useAuth';
import { config } from './config';
import apiClient from './apiClient';
import { initials, formatNumber } from './components/formatters';
import CommandPalette, { type PaletteCommand } from './components/CommandPalette';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ImpersonationBar } from './components/ImpersonationBar';
import { MfaRequiredWall } from './components/MfaRequiredWall';
import { useAdminStats, type AdminStats } from './hooks/useAdminStats';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /**
   * Từ khoá tiếng Anh còn quen với người vận hành. Nhãn điều hướng đã Việt hoá
   * nhưng người dùng vẫn gõ "audit", "broadcast" — không có alias thì palette
   * báo "không tìm thấy" cho đúng thứ họ đang cần.
   */
  aliases?: string[];
}

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Tổng quan',
    items: [
      { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true, aliases: ['dashboard'] },
      { to: '/analytics', label: 'Phân tích', icon: ChartLine, aliases: ['analytics'] },
    ],
  },
  {
    label: 'Kiểm duyệt',
    items: [
      { to: '/reports', label: 'Báo cáo', icon: Flag, aliases: ['reports'] },
      { to: '/conversations', label: 'Hội thoại', icon: MessageSquareText, aliases: ['conversations'] },
      { to: '/messages', label: 'Tin nhắn', icon: MessageSquare, aliases: ['messages'] },
      { to: '/moments', label: 'Khoảnh khắc', icon: Camera, aliases: ['moments'] },
      { to: '/music', label: 'Nhạc', icon: Music, aliases: ['music'] },
      { to: '/moderation-queue', label: 'Hàng đợi', icon: ListChecks, aliases: ['queue'] },
      { to: '/appeals', label: 'Kháng nghị', icon: Gavel, aliases: ['appeals'] },
    ],
  },
  {
    label: 'Người dùng',
    items: [
      { to: '/businesses', label: 'Doanh nghiệp', icon: Building2, aliases: ['businesses'] },
      { to: '/users', label: 'Người dùng', icon: Users, aliases: ['users'] },
    ],
  },
  {
    label: 'Bán hàng',
    items: [
      { to: '/products', label: 'Sản phẩm', icon: Package, aliases: ['products'] },
      { to: '/orders', label: 'Đơn hàng', icon: ShoppingCart, aliases: ['orders'] },
      { to: '/services', label: 'Dịch vụ', icon: Briefcase, aliases: ['services'] },
      { to: '/revenue', label: 'Doanh thu', icon: Banknote, aliases: ['revenue'] },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { to: '/health', label: 'Sức khỏe', icon: Activity, aliases: ['health'] },
      { to: '/ratelimit', label: 'Giới hạn tần suất', icon: ShieldAlert, aliases: ['rate limit', 'ratelimit'] },
      { to: '/ops-logs', label: 'Nhật ký vận hành', icon: FileClock, aliases: ['ops logs'] },
      { to: '/config', label: 'Cấu hình', icon: Settings, aliases: ['config'] },
      { to: '/broadcast', label: 'Thông báo', icon: Megaphone, aliases: ['broadcast'] },
      { to: '/audit-logs', label: 'Nhật ký thao tác', icon: ScrollText, aliases: ['audit log', 'audit'] },
    ],
  },
];

/** Nhãn trạng thái sức khỏe — server trả enum tiếng Anh, topbar không được hiện thô. */
const HEALTH_LABEL: Record<string, string> = {
  degraded: 'Suy giảm',
  error: 'Sự cố',
};

/**
 * Breadcrumb + palette dùng chung một nguồn nhãn. Trước đây breadcrumb ghi
 * "Quản lý người dùng" trong khi H1 ghi "Người dùng" — hai câu cho một trang.
 */
const routeTitles: Record<string, string> = {
  '/': 'Tổng quan vận hành',
  '/analytics': 'Phân tích',
  '/businesses': 'Doanh nghiệp',
  '/users': 'Người dùng',
  '/conversations': 'Hội thoại',
  '/messages': 'Tin nhắn',
  '/moments': 'Khoảnh khắc',
  '/music': 'Nhạc',
  '/reports': 'Báo cáo',
  '/products': 'Sản phẩm',
  '/orders': 'Đơn hàng',
  '/services': 'Dịch vụ',
  '/health': 'Sức khỏe hệ thống',
  '/ratelimit': 'Giới hạn tần suất',
  '/broadcast': 'Thông báo',
  '/audit-logs': 'Nhật ký thao tác',
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

  const navRef = useRef<HTMLElement>(null);
  const navToggleRef = useRef<HTMLButtonElement>(null);

  /**
   * Sidebar cao 21 mục → ở màn 768–900px chỉ ~13 mục lọt màn, phần còn lại phải
   * cuộn. Trước đây không cuộn hộ: mở `/ratelimit` thì mục đang active nằm
   * ngoài khung nhìn, người dùng mất dấu. `block: 'nearest'` để không giật
   * trang khi mục đã hiện sẵn.
   */
  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('.admin-nav-link.active');
    // jsdom (test) không cài scrollIntoView — không có nó thì chỉ là không cuộn.
    active?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [location.pathname]);

  /**
   * Drawer mobile là lớp phủ toàn màn: Tab vẫn đi được ra sau lưng nếu không
   * chặn, và backdrop có `onKeyDown` nhưng không bao giờ nhận focus nên Esc
   * trước đây không đóng được. Đóng bằng Esc + trả focus về nút mở.
   */
  useEffect(() => {
    if (!mobileNavOpen) return;
    const active = navRef.current?.querySelector<HTMLElement>('.admin-nav-link.active');
    active?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setMobileNavOpen(false);
      // Esc = huỷ mở drawer, focus phải về nút đã mở nó (không rơi về <body>).
      navToggleRef.current?.focus();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      window.localStorage.setItem('koola-admin:sidebar-collapsed', prev ? '0' : '1');
      return !prev;
    });
  }, []);

  // Palette nguồn duy nhất: mọi route trong navGroups (label + group + icon).
  const paletteCommands: PaletteCommand[] = navGroups.flatMap((g) =>
    g.items.map((item) => ({
      to: item.to,
      label: item.label,
      group: g.label,
      icon: item.icon,
      keywords: item.aliases,
    })),
  );

  // Wall 2FA: server bắt buộc + tài khoản chưa bật → chặn nội dung, chỉ hiện
  // form bật. Backend cũng trả 403 cho mọi route khác nên đây là lời giải thích.
  const mfaBlocked =
    !identityLoading && identity != null &&
    identity.mfaRequired === true && identity.twoFactorEnabled === false;

  const adminName = identity?.name ?? 'Admin';
  const adminInitial = initials(adminName, 'A');
  const isProd = config.appEnv === 'production';
  const healthStatus = useHealthStatus();
  // Drawer mobile luôn render full — collapsed rail chỉ áp dụng desktop.
  const effectiveCollapsed = sidebarCollapsed && !mobileNavOpen;

  const { data: stats } = useAdminStats();
  // Chỉ badge cho số thật, có endpoint: doanh nghiệp chờ duyệt là backlog duy
  // nhất đo được. Các mục khác không badge thay vì badge 0 gây nhiễu.
  const navBadge = (to: string): number | undefined => {
    if (to === '/businesses' && stats?.pendingVerification) return stats.pendingVerification;
    return undefined;
  };

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
        <div className="mobile-nav-backdrop" onClick={closeMobileNav} role="presentation" />
      )}

      <div className="admin-shell-body">

      <aside
        className={`admin-sidebar${mobileNavOpen ? ' admin-sidebar--open' : ''}${effectiveCollapsed ? ' admin-sidebar--collapsed' : ''}`}
        aria-label="Điều hướng quản trị"
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

        <nav className="admin-nav" aria-label="Mục điều hướng" ref={navRef}>
          {navGroups.map((group) => (
            <section className="admin-nav-section" key={group.label}>
              {!effectiveCollapsed && <p className="admin-nav-label">{group.label}</p>}
              {group.items.map((item) => {
                const badge = navBadge(item.to);
                return (
                  <NavLink
                    className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
                    end={item.end}
                    key={item.to}
                    to={item.to}
                    onClick={closeMobileNav}
                    title={effectiveCollapsed ? item.label : undefined}
                    aria-label={
                      effectiveCollapsed
                        ? badge
                          ? `${item.label} — ${badge} chờ duyệt`
                          : item.label
                        : undefined
                    }
                  >
                    <span className="admin-nav-icon" aria-hidden="true">
                      <item.icon size={18} strokeWidth={1.75} aria-hidden />
                    </span>
                    {!effectiveCollapsed && (
                      <>
                        <span className="admin-nav-text">{item.label}</span>
                        {badge ? <span className="admin-nav-badge">{formatNumber(badge)}</span> : null}
                      </>
                    )}
                    {effectiveCollapsed && badge ? (
                      <span className="admin-nav-dot" aria-hidden="true" />
                    ) : null}
                  </NavLink>
                );
              })}
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
              ref={navToggleRef}
              onClick={() => setMobileNavOpen((v) => !v)}
              type="button"
              aria-label={mobileNavOpen ? 'Đóng điều hướng' : 'Mở điều hướng'}
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
            {/* Cảnh báo 2FA: tài khoản admin chưa bật xác thực hai lớp thì chỉ
                cần lộ mật khẩu là vào được toàn bộ dữ liệu. Link thẳng tới hồ
                sơ của chính mình — panel bật 2FA chỉ hiện ở đó. */}
            {!identityLoading && identity && identity.twoFactorEnabled === false && (
              <Link
                to={identity.id ? `/users/${identity.id}` : '/users'}
                className="badge badge-warning admin-2fa-badge"
                title="Bật xác thực hai lớp để bảo vệ tài khoản quản trị"
              >
                <ShieldAlert size={13} aria-hidden />
                <span className="admin-badge-text">Chưa bật 2FA</span>
              </Link>
            )}
            {healthStatus && (
              <Link
                to="/health"
                className={`badge ${healthStatus === 'degraded' ? 'badge-warning' : 'badge-danger'} admin-health-badge`}
                title="Xem chi tiết sức khỏe hệ thống"
              >
                <TriangleAlert size={13} aria-hidden />
                <span className="admin-badge-text">
                  Hệ thống: {HEALTH_LABEL[healthStatus] ?? healthStatus}
                </span>
              </Link>
            )}
            <CommandPalette commands={paletteCommands} />
            <span className="admin-topbar-divider" aria-hidden="true" />
            {/* Chip là link tới hồ sơ của chính mình: đây là chỗ duy nhất mở
                được 2FA và xem phiên đăng nhập. Trước đây là <div> có hover
                nhưng bấm không được — trông như nút mà không phải nút. */}
            <Link
              to={identity?.id ? `/users/${identity.id}` : '/users'}
              className="admin-identity-chip"
              title="Hồ sơ của tôi"
            >
              <div className="admin-avatar" aria-hidden="true">
                {adminInitial}
              </div>
              {!identityLoading && (
                <div className="admin-identity-text">
                  <div className="cell-title">{adminName}</div>
                  <div className="cell-meta">{identity?.email ?? 'platform admin'}</div>
                </div>
              )}
            </Link>
          </div>
        </header>

        <div className="admin-content-scroll">
          <main className="admin-content" id="admin-content" tabIndex={-1}>
            {mfaBlocked ? <MfaRequiredWall userId={identity.id} /> : <Outlet />}
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
