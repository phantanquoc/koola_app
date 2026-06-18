import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './useAuth';

export default function AppLayout() {
  const { logout } = useAuth();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav
        style={{
          width: 220,
          background: '#1a1a2e',
          color: '#eee',
          padding: '1.5rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          flexShrink: 0,
        }}
        aria-label="Điều hướng quản trị"
      >
        <div
          style={{
            fontWeight: 'bold',
            fontSize: '1.2rem',
            marginBottom: '1.5rem',
            color: '#fff',
          }}
        >
          Koola Admin
        </div>
        <NavLink to="/" end style={navStyle}>
          Tổng quan
        </NavLink>
        <NavLink to="/businesses" style={navStyle}>
          Doanh nghiệp
        </NavLink>
        <NavLink to="/users" style={navStyle}>
          Người dùng
        </NavLink>
        <button
          onClick={logout}
          style={{
            marginTop: 'auto',
            background: 'none',
            border: '1px solid #555',
            color: '#ccc',
            cursor: 'pointer',
            padding: '0.5rem',
            borderRadius: 4,
            textAlign: 'left',
          }}
        >
          Đăng xuất
        </button>
      </nav>
      <main style={{ flex: 1, background: '#f4f6f8', overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}

function navStyle({ isActive }: { isActive: boolean }): React.CSSProperties {
  return {
    display: 'block',
    padding: '0.6rem 0.75rem',
    borderRadius: 4,
    color: isActive ? '#fff' : '#bbb',
    background: isActive ? '#16213e' : 'transparent',
    textDecoration: 'none',
    fontWeight: isActive ? 'bold' : 'normal',
  };
}
