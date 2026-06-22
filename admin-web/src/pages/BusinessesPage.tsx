import { useEffect, useState } from 'react';
import axios from 'axios';
import apiClient from '../apiClient';

interface Business {
  _id: string;
  displayName: string;
  email?: string;
  verificationStatus: string;
  licenseImageUrl: string | null;
}

interface PaginatedResponse {
  data: Business[];
  total: number;
  page: number;
  limit: number;
}

const rejectTemplates = [
  'Ảnh giấy phép không rõ, vui lòng tải lại ảnh sắc nét hơn.',
  'Thông tin doanh nghiệp chưa khớp với giấy phép.',
  'Thiếu giấy phép hợp lệ để xác minh doanh nghiệp.',
];

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'B';
}

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requestedPage, setRequestedPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .get<PaginatedResponse>(
        `/admin/businesses/pending?page=${requestedPage}&limit=${limit}`,
      )
      .then((res) => {
        if (cancelled) return;
        setBusinesses(res.data.data);
        setTotal(res.data.total);
        setPage(res.data.page);
      })
      .catch(() => {
        if (!cancelled) setError('Không thể tải danh sách doanh nghiệp.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestedPage]);

  function removeFromList(id: string) {
    setBusinesses((prev) => prev.filter((b) => b._id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }

  async function handleApprove(id: string) {
    try {
      await apiClient.post(`/admin/businesses/${id}/approve`);
      removeFromList(id);
    } catch {
      alert('Duyệt thất bại. Vui lòng thử lại.');
    }
  }

  function openRejectDialog(id: string) {
    setRejectTarget(id);
    setRejectReason('');
    setRejectError(null);
  }

  async function handleRejectSubmit() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      setRejectError('Vui lòng nhập lý do từ chối.');
      return;
    }
    try {
      await apiClient.post(`/admin/businesses/${rejectTarget}/reject`, {
        rejectionReason: rejectReason.trim(),
      });
      removeFromList(rejectTarget);
      setRejectTarget(null);
      setRejectReason('');
      setRejectError(null);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setRejectError('Lý do từ chối không hợp lệ.');
      } else {
        alert('Từ chối thất bại. Vui lòng thử lại.');
      }
    }
  }

  const totalPages = Math.ceil(total / limit);
  const rejectingBusiness = businesses.find((business) => business._id === rejectTarget);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <div className="page-eyebrow">Business verification</div>
          <h1 className="page-title">Doanh nghiệp chờ xét duyệt</h1>
          <p className="page-description">
            Kiểm tra giấy phép, email và thông tin đăng ký trước khi mở quyền business account.
          </p>
        </div>
        <span className="badge badge-warning">{total.toLocaleString('vi-VN')} đang chờ</span>
      </header>

      <section className="table-shell" aria-label="Queue doanh nghiệp chờ duyệt">
        <div className="table-toolbar">
          <div>
            <h2 className="panel-title">Verification queue</h2>
            <p className="panel-subtitle">Duyệt nhanh nhưng vẫn giữ lý do từ chối rõ ràng.</p>
          </div>
          <span className="badge badge-primary">SLA review</span>
        </div>

        {error && <p className="alert" role="alert" style={{ margin: 'var(--space-5)' }}>{error}</p>}

        {loading && (
          <div className="loading-state">
            <div>
              <div className="state-icon" aria-hidden="true">⌁</div>
              <p className="state-title">Đang tải queue</p>
              <p className="state-copy">Koola đang lấy danh sách doanh nghiệp cần xét duyệt.</p>
            </div>
          </div>
        )}

        {!loading && businesses.length === 0 && !error && (
          <div className="empty-state">
            <div>
              <div className="state-icon" aria-hidden="true">✓</div>
              <p className="state-title">Queue đã sạch</p>
              <p className="state-copy">Không có doanh nghiệp nào đang chờ xét duyệt.</p>
            </div>
          </div>
        )}

        {!loading && businesses.length > 0 && (
          <div className="table-scroll">
            <table className="data-table" aria-label="Danh sách doanh nghiệp chờ xét duyệt">
              <thead>
                <tr>
                  <th scope="col">Doanh nghiệp</th>
                  <th scope="col">Email</th>
                  <th scope="col">Giấy phép</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => (
                  <tr key={b._id}>
                    <td>
                      <div className="cell-primary">
                        <div className="cell-avatar" aria-hidden="true">{initials(b.displayName)}</div>
                        <div>
                          <div className="cell-title">{b.displayName}</div>
                          <div className="cell-meta k-mono">{b._id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="cell-title">{b.email ?? '—'}</div>
                      <div className="cell-meta">Business contact</div>
                    </td>
                    <td>
                      {b.licenseImageUrl ? (
                        <a
                          className="license-preview"
                          href={b.licenseImageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Xem giấy phép của ${b.displayName}`}
                        >
                          <img
                            className="license-thumb"
                            src={b.licenseImageUrl}
                            alt={`Giấy phép doanh nghiệp ${b.displayName}`}
                          />
                          <span>Mở ảnh</span>
                        </a>
                      ) : (
                        <span className="badge badge-muted">Không có ảnh</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-warning">{b.verificationStatus}</span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleApprove(b._id)}
                          type="button"
                          aria-label={`Duyệt ${b.displayName}`}
                        >
                          Duyệt
                        </button>
                        <button
                          className="btn btn-danger-ghost btn-sm"
                          onClick={() => openRejectDialog(b._id)}
                          type="button"
                          aria-label={`Từ chối ${b.displayName}`}
                        >
                          Từ chối
                        </button>
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
              Trang {page} / {totalPages} · {total.toLocaleString('vi-VN')} hồ sơ
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

      {rejectTarget && (
        <div className="overlay dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="reject-dialog-title">
          <div className="dialog">
            <div className="dialog-header">
              <div>
                <div className="page-eyebrow">Reject business</div>
                <h2 id="reject-dialog-title" className="panel-title">Lý do từ chối</h2>
                <p className="panel-subtitle">
                  {rejectingBusiness
                    ? `Gửi phản hồi rõ ràng cho ${rejectingBusiness.displayName}.`
                    : 'Gửi phản hồi rõ ràng để doanh nghiệp có thể nộp lại đúng.'}
                </p>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectError(null);
                }}
                type="button"
              >
                Đóng
              </button>
            </div>
            <div className="dialog-body page-stack">
              <div className="filter-chip-row" style={{ padding: 0 }}>
                {rejectTemplates.map((template) => (
                  <button
                    className="filter-chip"
                    key={template}
                    onClick={() => setRejectReason(template)}
                    type="button"
                  >
                    {template.split(',')[0]}
                  </button>
                ))}
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="reject-reason">
                  Lý do
                </label>
                <textarea
                  className="textarea"
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  aria-label="Nhập lý do từ chối"
                  aria-required="true"
                  placeholder="Nhập lý do cụ thể để doanh nghiệp biết cần sửa gì..."
                />
              </div>
              {rejectError && (
                <p className="alert" role="alert">
                  {rejectError}
                </p>
              )}
              <div className="table-actions">
                <button className="btn btn-danger" onClick={handleRejectSubmit} type="button">
                  Xác nhận từ chối
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setRejectTarget(null);
                    setRejectError(null);
                  }}
                  type="button"
                >
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
