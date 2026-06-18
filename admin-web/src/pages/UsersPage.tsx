import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import apiClient from '../apiClient';

interface User {
  _id: string;
  displayName: string;
  email?: string;
  phone?: string;
  accountType: string;
  isBanned: boolean;
  verificationStatus?: string;
  rejectionReason?: string;
  ownerUserId?: string;
}

interface PaginatedUsers {
  data: User[];
  total: number;
  page: number;
  limit: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [accountType, setAccountType] = useState<'personal' | 'business' | ''>('');

  const [detailUser, setDetailUser] = useState<User | null>(null);
  const [confirmBan, setConfirmBan] = useState<{
    id: string;
    action: 'ban' | 'unban';
    name: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requestedPage, setRequestedPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(requestedPage),
      limit: String(limit),
    });
    if (search) params.set('search', search);
    if (accountType) params.set('accountType', accountType);
    apiClient
      .get<PaginatedUsers>(`/admin/users?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setUsers(res.data.data);
        setTotal(res.data.total);
        setPage(res.data.page);
      })
      .catch(() => {
        if (!cancelled) setError('Không thể tải danh sách người dùng.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestedPage, search, accountType]);

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setRequestedPage(1);
    setSearch(searchInput);
  }

  async function openDetail(id: string) {
    try {
      const res = await apiClient.get<User>(`/admin/users/${id}`);
      setDetailUser(res.data);
    } catch {
      alert('Không thể tải thông tin người dùng.');
    }
  }

  async function executeBanAction() {
    if (!confirmBan) return;
    const { id, action } = confirmBan;
    try {
      await apiClient.post(`/admin/users/${id}/${action}`);
      // Reflect the new ban state in the list and detail view
      const isBanned = action === 'ban';
      setUsers((prev) =>
        prev.map((u) => (u._id === id ? { ...u, isBanned } : u)),
      );
      if (detailUser?._id === id) {
        setDetailUser({ ...detailUser, isBanned });
      }
    } catch {
      alert('Thao tác thất bại. Vui lòng thử lại.');
    } finally {
      setConfirmBan(null);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Quản lý người dùng</h1>

      {/* Search + filter */}
      <form
        onSubmit={handleSearchSubmit}
        style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}
        aria-label="Tìm kiếm và lọc người dùng"
      >
        <input
          type="search"
          placeholder="Tìm tên, email, số điện thoại..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '0.5rem' }}
          aria-label="Từ khóa tìm kiếm"
        />
        <select
          value={accountType}
          onChange={(e) => {
            setRequestedPage(1);
            setAccountType(e.target.value as 'personal' | 'business' | '');
          }}
          aria-label="Lọc theo loại tài khoản"
          style={{ padding: '0.5rem' }}
        >
          <option value="">Tất cả loại</option>
          <option value="personal">Cá nhân</option>
          <option value="business">Doanh nghiệp</option>
        </select>
        <button type="submit" style={{ cursor: 'pointer', padding: '0.5rem 1rem' }}>
          Tìm
        </button>
      </form>

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {loading && <p>Đang tải...</p>}

      {!loading && users.length === 0 && !error && (
        <p>Không tìm thấy người dùng nào.</p>
      )}

      {users.length > 0 && (
        <table
          style={{ width: '100%', borderCollapse: 'collapse' }}
          aria-label="Danh sách người dùng"
        >
          <thead>
            <tr style={{ background: '#f4f6f8' }}>
              <th style={thStyle}>Tên</th>
              <th style={thStyle}>Email / Điện thoại</th>
              <th style={thStyle}>Loại</th>
              <th style={thStyle}>Trạng thái</th>
              <th style={thStyle}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>
                  <button
                    onClick={() => openDetail(u._id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#0066cc',
                      textDecoration: 'underline',
                      padding: 0,
                    }}
                    aria-label={`Xem chi tiết ${u.displayName}`}
                  >
                    {u.displayName}
                  </button>
                </td>
                <td style={tdStyle}>{u.email ?? u.phone ?? '—'}</td>
                <td style={tdStyle}>
                  {u.accountType === 'business' ? 'Doanh nghiệp' : 'Cá nhân'}
                </td>
                <td style={tdStyle}>
                  {u.isBanned ? (
                    <span style={{ color: '#c0392b' }}>Đã cấm</span>
                  ) : (
                    <span style={{ color: '#27ae60' }}>Hoạt động</span>
                  )}
                </td>
                <td style={tdStyle}>
                  {u.isBanned ? (
                    <button
                      onClick={() =>
                        setConfirmBan({ id: u._id, action: 'unban', name: u.displayName })
                      }
                      style={{ cursor: 'pointer' }}
                      aria-label={`Bỏ cấm ${u.displayName}`}
                    >
                      Bỏ cấm
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        setConfirmBan({ id: u._id, action: 'ban', name: u.displayName })
                      }
                      style={{ cursor: 'pointer', color: '#c0392b' }}
                      aria-label={`Cấm ${u.displayName}`}
                    >
                      Cấm
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ marginTop: '1rem', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setRequestedPage(page - 1)}
            disabled={page <= 1}
            aria-label="Trang trước"
          >
            &laquo; Trước
          </button>
          <span>
            Trang {page} / {totalPages}
          </span>
          <button
            onClick={() => setRequestedPage(page + 1)}
            disabled={page >= totalPages}
            aria-label="Trang sau"
          >
            Sau &raquo;
          </button>
        </div>
      )}

      {/* User detail panel */}
      {detailUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-dialog-title"
          style={overlayStyle}
        >
          <div style={dialogStyle}>
            <h2 id="detail-dialog-title">{detailUser.displayName}</h2>
            <dl>
              <dt>Email</dt>
              <dd>{detailUser.email ?? '—'}</dd>
              <dt>Điện thoại</dt>
              <dd>{detailUser.phone ?? '—'}</dd>
              <dt>Loại tài khoản</dt>
              <dd>
                {detailUser.accountType === 'business'
                  ? 'Doanh nghiệp'
                  : 'Cá nhân'}
              </dd>
              {detailUser.accountType === 'business' && (
                <>
                  <dt>Trạng thái xác minh</dt>
                  <dd>{detailUser.verificationStatus ?? '—'}</dd>
                  {detailUser.rejectionReason && (
                    <>
                      <dt>Lý do từ chối</dt>
                      <dd>{detailUser.rejectionReason}</dd>
                    </>
                  )}
                  {detailUser.ownerUserId && (
                    <>
                      <dt>Chủ sở hữu (ID)</dt>
                      <dd>{detailUser.ownerUserId}</dd>
                    </>
                  )}
                </>
              )}
              <dt>Trạng thái</dt>
              <dd>{detailUser.isBanned ? 'Đã bị cấm' : 'Hoạt động'}</dd>
            </dl>
            <button
              onClick={() => setDetailUser(null)}
              style={{ cursor: 'pointer', marginTop: '1rem' }}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Ban/Unban confirmation dialog */}
      {confirmBan && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          style={overlayStyle}
        >
          <div style={dialogStyle}>
            <h2 id="confirm-dialog-title">Xác nhận</h2>
            <p>
              {confirmBan.action === 'ban'
                ? `Bạn có chắc muốn cấm người dùng "${confirmBan.name}"?`
                : `Bạn có chắc muốn bỏ cấm người dùng "${confirmBan.name}"?`}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
              <button
                onClick={executeBanAction}
                style={{
                  cursor: 'pointer',
                  color: confirmBan.action === 'ban' ? '#c0392b' : undefined,
                }}
              >
                {confirmBan.action === 'ban' ? 'Xác nhận cấm' : 'Xác nhận bỏ cấm'}
              </button>
              <button
                onClick={() => setConfirmBan(null)}
                style={{ cursor: 'pointer' }}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  textAlign: 'left',
  fontWeight: 'bold',
  borderBottom: '2px solid #ddd',
};

const tdStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  verticalAlign: 'middle',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  background: '#fff',
  padding: '2rem',
  borderRadius: 8,
  width: 520,
  maxWidth: '90%',
};
