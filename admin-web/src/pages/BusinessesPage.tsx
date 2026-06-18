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
    setTotal((t) => t - 1);
  }

  async function handleApprove(id: string) {
    try {
      await apiClient.post(`/admin/businesses/${id}/approve`);
      removeFromList(id);
    } catch {
      alert('Duyệt thất bại. Vui lòng thử lại.');
    }
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

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Doanh nghiệp chờ xét duyệt</h1>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {loading && <p>Đang tải...</p>}

      {!loading && businesses.length === 0 && !error && (
        <p>Không có doanh nghiệp chờ xét duyệt.</p>
      )}

      {businesses.length > 0 && (
        <table
          style={{ width: '100%', borderCollapse: 'collapse' }}
          aria-label="Danh sách doanh nghiệp chờ xét duyệt"
        >
          <thead>
            <tr style={{ background: '#f4f6f8' }}>
              <th style={thStyle}>Tên</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Giấy phép</th>
              <th style={thStyle}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((b) => (
              <tr key={b._id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>{b.displayName}</td>
                <td style={tdStyle}>{b.email ?? '—'}</td>
                <td style={tdStyle}>
                  {b.licenseImageUrl ? (
                    <a
                      href={b.licenseImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Xem giấy phép của ${b.displayName}`}
                    >
                      <img
                        src={b.licenseImageUrl}
                        alt={`Giấy phép doanh nghiệp ${b.displayName}`}
                        style={{ maxHeight: 60, maxWidth: 100 }}
                      />
                    </a>
                  ) : (
                    <span style={{ color: '#999' }}>Không có ảnh</span>
                  )}
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={() => handleApprove(b._id)}
                    style={{ marginRight: 8, cursor: 'pointer' }}
                    aria-label={`Duyệt ${b.displayName}`}
                  >
                    Duyệt
                  </button>
                  <button
                    onClick={() => {
                      setRejectTarget(b._id);
                      setRejectReason('');
                      setRejectError(null);
                    }}
                    style={{ cursor: 'pointer' }}
                    aria-label={`Từ chối ${b.displayName}`}
                  >
                    Từ chối
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ marginTop: '1rem', display: 'flex', gap: 8 }}>
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

      {/* Reject reason modal */}
      {rejectTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-dialog-title"
          style={overlayStyle}
        >
          <div style={dialogStyle}>
            <h2 id="reject-dialog-title">Lý do từ chối</h2>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              style={{ width: '100%', boxSizing: 'border-box' }}
              aria-label="Nhập lý do từ chối"
              aria-required="true"
            />
            {rejectError && (
              <p role="alert" style={{ color: '#c0392b' }}>
                {rejectError}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
              <button onClick={handleRejectSubmit} style={{ cursor: 'pointer' }}>
                Xác nhận từ chối
              </button>
              <button
                onClick={() => {
                  setRejectTarget(null);
                  setRejectError(null);
                }}
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
  width: 480,
  maxWidth: '90%',
};
