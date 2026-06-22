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

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';
}

function accountTypeLabel(type: string) {
  return type === 'business' ? 'Doanh nghiệp' : 'Cá nhân';
}

function verificationTone(status?: string) {
  if (status === 'verified') return 'badge-success';
  if (status === 'rejected') return 'badge-danger';
  if (status === 'pending') return 'badge-warning';
  return 'badge-muted';
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
    setSearch(searchInput.trim());
  }

  function clearFilters() {
    setSearch('');
    setSearchInput('');
    setAccountType('');
    setRequestedPage(1);
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
  const hasActiveFilters = Boolean(search || accountType);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <div className="page-eyebrow">Users</div>
          <h1 className="page-title">Quản lý người dùng</h1>
          <p className="page-description">
            Tìm kiếm tài khoản, kiểm tra trạng thái và xử lý ban/unban mà không rời khỏi bảng.
          </p>
        </div>
        <span className="badge badge-muted">{total.toLocaleString('vi-VN')} records</span>
      </header>

      <section className="table-shell" aria-label="Bảng quản lý người dùng">
        <form className="table-toolbar" onSubmit={handleSearchSubmit} aria-label="Tìm kiếm và lọc người dùng">
          <div className="table-toolbar-main">
            <div className="form-field search-field">
              <label className="form-label" htmlFor="user-search">
                Tìm kiếm
              </label>
              <input
                className="input"
                id="user-search"
                type="search"
                placeholder="Tên, email, số điện thoại..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Từ khóa tìm kiếm"
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="account-type-filter">
                Loại tài khoản
              </label>
              <select
                className="select"
                id="account-type-filter"
                value={accountType}
                onChange={(e) => {
                  setRequestedPage(1);
                  setAccountType(e.target.value as 'personal' | 'business' | '');
                }}
                aria-label="Lọc theo loại tài khoản"
              >
                <option value="">Tất cả loại</option>
                <option value="personal">Cá nhân</option>
                <option value="business">Doanh nghiệp</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit">
              Tìm
            </button>
            {hasActiveFilters && (
              <button className="btn btn-ghost" onClick={clearFilters} type="button">
                Xóa lọc
              </button>
            )}
          </div>
        </form>

        {hasActiveFilters && (
          <div className="filter-chip-row" aria-label="Bộ lọc đang bật">
            {search && <span className="filter-chip">Từ khóa: {search}</span>}
            {accountType && <span className="filter-chip">Loại: {accountTypeLabel(accountType)}</span>}
          </div>
        )}

        {error && <p className="alert" role="alert" style={{ margin: 'var(--space-5)' }}>{error}</p>}

        {loading && (
          <div className="loading-state">
            <div>
              <div className="state-icon" aria-hidden="true">⌁</div>
              <p className="state-title">Đang tải danh sách</p>
              <p className="state-copy">Koola đang lấy dữ liệu người dùng mới nhất.</p>
            </div>
          </div>
        )}

        {!loading && users.length === 0 && !error && (
          <div className="empty-state">
            <div>
              <div className="state-icon" aria-hidden="true">◎</div>
              <p className="state-title">Không tìm thấy người dùng</p>
              <p className="state-copy">Thử đổi từ khóa hoặc xóa bộ lọc để xem toàn bộ danh sách.</p>
              {hasActiveFilters && (
                <button className="btn btn-secondary" onClick={clearFilters} type="button">
                  Xóa bộ lọc
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && users.length > 0 && (
          <div className="table-scroll">
            <table className="data-table" aria-label="Danh sách người dùng">
              <thead>
                <tr>
                  <th scope="col">Người dùng</th>
                  <th scope="col">Liên hệ</th>
                  <th scope="col">Loại</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Xác minh</th>
                  <th scope="col">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <div className="cell-primary">
                        <div className="cell-avatar" aria-hidden="true">{initials(u.displayName)}</div>
                        <div>
                          <button
                            className="cell-link"
                            onClick={() => openDetail(u._id)}
                            type="button"
                            aria-label={`Xem chi tiết ${u.displayName}`}
                          >
                            {u.displayName}
                          </button>
                          <div className="cell-meta k-mono">{u._id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="cell-title">{u.email ?? u.phone ?? '—'}</div>
                      <div className="cell-meta">Primary contact</div>
                    </td>
                    <td>
                      <span className={u.accountType === 'business' ? 'badge badge-primary' : 'badge badge-muted'}>
                        {accountTypeLabel(u.accountType)}
                      </span>
                    </td>
                    <td>
                      <span className={u.isBanned ? 'badge badge-danger' : 'badge badge-success'}>
                        {u.isBanned ? 'Đã cấm' : 'Hoạt động'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${verificationTone(u.verificationStatus)}`}>
                        {u.verificationStatus ?? '—'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openDetail(u._id)} type="button">
                          Chi tiết
                        </button>
                        {u.isBanned ? (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setConfirmBan({ id: u._id, action: 'unban', name: u.displayName })}
                            type="button"
                            aria-label={`Bỏ cấm ${u.displayName}`}
                          >
                            Bỏ cấm
                          </button>
                        ) : (
                          <button
                            className="btn btn-danger-ghost btn-sm"
                            onClick={() => setConfirmBan({ id: u._id, action: 'ban', name: u.displayName })}
                            type="button"
                            aria-label={`Cấm ${u.displayName}`}
                          >
                            Cấm
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="table-footer">
            <span className="cell-meta">
              Trang {page} / {totalPages} · {total.toLocaleString('vi-VN')} người dùng
            </span>
            <div className="pagination-controls">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setRequestedPage(page - 1)}
                disabled={page <= 1}
                type="button"
                aria-label="Trang trước"
              >
                Trước
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setRequestedPage(page + 1)}
                disabled={page >= totalPages}
                type="button"
                aria-label="Trang sau"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </section>

      {detailUser && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="detail-dialog-title">
          <aside className="drawer">
            <div className="drawer-header">
              <div>
                <div className="page-eyebrow">User profile</div>
                <h2 id="detail-dialog-title" className="panel-title">{detailUser.displayName}</h2>
                <p className="panel-subtitle">Thông tin tài khoản và trạng thái moderation.</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setDetailUser(null)} type="button">
                Đóng
              </button>
            </div>
            <div className="drawer-body page-stack">
              <div className="cell-primary">
                <div className="cell-avatar" aria-hidden="true">{initials(detailUser.displayName)}</div>
                <div>
                  <div className="cell-title">{detailUser.displayName}</div>
                  <div className="cell-meta k-mono">{detailUser._id}</div>
                </div>
              </div>

              <dl className="description-list">
                <dt>Email</dt>
                <dd>{detailUser.email ?? '—'}</dd>
                <dt>Điện thoại</dt>
                <dd>{detailUser.phone ?? '—'}</dd>
                <dt>Loại tài khoản</dt>
                <dd>{accountTypeLabel(detailUser.accountType)}</dd>
                <dt>Trạng thái</dt>
                <dd>{detailUser.isBanned ? 'Đã bị cấm' : 'Hoạt động'}</dd>
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
                        <dt>Chủ sở hữu</dt>
                        <dd className="k-mono">{detailUser.ownerUserId}</dd>
                      </>
                    )}
                  </>
                )}
              </dl>

              <div className="surface-card" style={{ padding: 'var(--space-4)' }}>
                <div className="panel-title">Moderation</div>
                <p className="panel-subtitle">Hành động này ảnh hưởng trực tiếp đến khả năng truy cập của user.</p>
                <div style={{ marginTop: 'var(--space-4)' }}>
                  {detailUser.isBanned ? (
                    <button
                      className="btn btn-secondary"
                      onClick={() => setConfirmBan({ id: detailUser._id, action: 'unban', name: detailUser.displayName })}
                      type="button"
                    >
                      Bỏ cấm
                    </button>
                  ) : (
                    <button
                      className="btn btn-danger"
                      onClick={() => setConfirmBan({ id: detailUser._id, action: 'ban', name: detailUser.displayName })}
                      type="button"
                    >
                      Cấm người dùng
                    </button>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {confirmBan && (
        <div className="overlay dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
          <div className="dialog">
            <div className="dialog-header">
              <div>
                <h2 id="confirm-dialog-title" className="panel-title">Xác nhận thao tác</h2>
                <p className="panel-subtitle">
                  {confirmBan.action === 'ban'
                    ? `Bạn có chắc muốn cấm "${confirmBan.name}"?`
                    : `Bạn có chắc muốn bỏ cấm "${confirmBan.name}"?`}
                </p>
              </div>
            </div>
            <div className="dialog-body">
              <div className="table-actions">
                <button
                  className={confirmBan.action === 'ban' ? 'btn btn-danger' : 'btn btn-primary'}
                  onClick={executeBanAction}
                  type="button"
                >
                  {confirmBan.action === 'ban' ? 'Xác nhận cấm' : 'Bỏ cấm'}
                </button>
                <button className="btn btn-secondary" onClick={() => setConfirmBan(null)} type="button">
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
