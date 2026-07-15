import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import apiClient from '../apiClient';
import StateBlock from '../components/StateBlock';
import { VerificationBadge } from '../components/StatusBadge';
import { initials } from '../components/formatters';
import Dialog from '../components/Dialog';
import LicensePreview from '../components/LicensePreview';
import { useToast } from '../components/Toast';

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
  'Anh giay phep khong ro, vui long tai lai anh sac net hon.',
  'Thong tin doanh nghiep chua khop voi giay phep.',
  'Thieu giay phep hop le de xac minh doanh nghiep.',
];

export default function BusinessesPage() {
  const { addToast } = useToast();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // Approve confirmation
  const [approveTarget, setApproveTarget] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Search and filter (client-side)
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

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
        if (!cancelled) setError('Khong the tai danh sach doanh nghiep.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestedPage]);

  // Client-side filtering of fetched businesses
  const filteredBusinesses = useMemo(() => {
    if (!searchQuery) return businesses;
    const q = searchQuery.toLowerCase();
    return businesses.filter(
      (b) =>
        b.displayName.toLowerCase().includes(q) ||
        (b.email && b.email.toLowerCase().includes(q)) ||
        b._id.toLowerCase().includes(q),
    );
  }, [businesses, searchQuery]);

  const hasActiveFilters = Boolean(searchQuery);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
  }

  function clearFilters() {
    setSearchInput('');
    setSearchQuery('');
  }

  function removeFromList(id: string) {
    setBusinesses((prev) => prev.filter((b) => b._id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }

  // Approve with confirmation
  function requestApprove(id: string) {
    setApproveTarget(id);
    setApproveError(null);
  }

  async function confirmApprove() {
    if (!approveTarget || actioningId) return;
    setActioningId(approveTarget);
    setApproveError(null);
    try {
      await apiClient.post(`/admin/businesses/${approveTarget}/approve`);
      const name = businesses.find((b) => b._id === approveTarget)?.displayName ?? '';
      removeFromList(approveTarget);
      addToast('success', `Da duyet ${name} thanh cong.`);
      setApproveTarget(null);
    } catch {
      setApproveError('Duyet that bai. Vui long thu lai.');
    } finally {
      setActioningId(null);
    }
  }

  function openRejectDialog(id: string) {
    setRejectTarget(id);
    setRejectReason('');
    setRejectError(null);
  }

  async function handleRejectSubmit() {
    if (!rejectTarget || rejectSubmitting) return;
    if (!rejectReason.trim()) {
      setRejectError('Vui long nhap ly do tu choi.');
      return;
    }
    setRejectSubmitting(true);
    try {
      await apiClient.post(`/admin/businesses/${rejectTarget}/reject`, {
        rejectionReason: rejectReason.trim(),
      });
      const name = businesses.find((b) => b._id === rejectTarget)?.displayName ?? '';
      removeFromList(rejectTarget);
      setRejectTarget(null);
      setRejectReason('');
      setRejectError(null);
      addToast('success', `Da tu choi ${name}.`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setRejectError('Ly do tu choi khong hop le.');
      } else {
        addToast('error', 'Tu choi that bai. Vui long thu lai.');
      }
    } finally {
      setRejectSubmitting(false);
    }
  }

  const totalPages = Math.ceil(total / limit);
  const rejectingBusiness = businesses.find((b) => b._id === rejectTarget);
  const approvingBusiness = businesses.find((b) => b._id === approveTarget);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <div className="page-eyebrow">Business verification</div>
          <h1 className="page-title">Doanh nghiep cho xet duyet</h1>
          <p className="page-description">
            Kiem tra giay phep, email va thong tin dang ky truoc khi mo quyen business account.
          </p>
        </div>
        <span className="badge badge-warning">{total.toLocaleString('vi-VN')} dang cho</span>
      </header>

      <section className="table-shell" aria-label="Queue doanh nghiep cho duyet">
        <form className="table-toolbar" onSubmit={handleSearchSubmit} aria-label="Tim kiem doanh nghiep">
          <div className="table-toolbar-main">
            <div className="form-field search-field">
              <label className="form-label" htmlFor="biz-search">
                Tim kiem
              </label>
              <input
                className="input"
                id="biz-search"
                type="search"
                placeholder="Ten, email, ID..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Tu khoa tim kiem doanh nghiep"
              />
            </div>
            <button className="btn btn-primary" type="submit">
              Tim
            </button>
            {hasActiveFilters && (
              <button className="btn btn-ghost" onClick={clearFilters} type="button">
                Xoa loc
              </button>
            )}
          </div>
          <span className="badge badge-primary">SLA review</span>
        </form>

        {hasActiveFilters && (
          <div className="filter-chip-row" aria-label="Bo loc dang bat">
            <span className="filter-chip">Tu khoa: {searchQuery}</span>
          </div>
        )}

        {error && <p className="alert" role="alert" style={{ margin: 'var(--space-5)' }}>{error}</p>}

        {loading && (
          <StateBlock
            variant="loading"
            icon="⌁"
            title="Dang tai queue"
            copy="Koola dang lay danh sach doanh nghiep can xet duyet."
          />
        )}

        {!loading && filteredBusinesses.length === 0 && !error && (
          <StateBlock
            variant="empty"
            icon="✓"
            title={hasActiveFilters ? 'Khong tim thay doanh nghiep' : 'Queue da sach'}
            copy={hasActiveFilters ? 'Thu doi tu khoa hoac xoa bo loc.' : 'Khong co doanh nghiep nao dang cho xet duyet.'}
          >
            {hasActiveFilters && (
              <button className="btn btn-secondary" onClick={clearFilters} type="button">
                Xoa bo loc
              </button>
            )}
          </StateBlock>
        )}

        {!loading && filteredBusinesses.length > 0 && (
          <div className="table-scroll">
            <table className="data-table" aria-label="Danh sach doanh nghiep cho xet duyet">
              <thead>
                <tr>
                  <th scope="col">Doanh nghiep</th>
                  <th scope="col">Email</th>
                  <th scope="col">Giay phep</th>
                  <th scope="col">Trang thai</th>
                  <th scope="col">Hanh dong</th>
                </tr>
              </thead>
              <tbody>
                {filteredBusinesses.map((b) => (
                  <tr key={b._id}>
                    <td>
                      <div className="cell-primary">
                        <div className="cell-avatar" aria-hidden="true">{initials(b.displayName, 'B')}</div>
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
                      <LicensePreview
                        url={b.licenseImageUrl}
                        businessName={b.displayName}
                        onRefresh={() => {
                          apiClient
                            .get<{ licenseImageUrl: string | null }>(`/admin/businesses/${b._id}`)
                            .then((res) => {
                              setBusinesses((prev) =>
                                prev.map((biz) =>
                                  biz._id === b._id
                                    ? { ...biz, licenseImageUrl: res.data.licenseImageUrl }
                                    : biz,
                                ),
                              );
                            })
                            .catch(() => {
                              addToast('error', 'Khong the tai lai giay phep.');
                            });
                        }}
                      />
                    </td>
                    <td>
                      <VerificationBadge status={b.verificationStatus} />
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => requestApprove(b._id)}
                          type="button"
                          disabled={actioningId === b._id}
                          aria-label={`Duyet ${b.displayName}`}
                        >
                          {actioningId === b._id ? 'Dang duyet...' : 'Duyet'}
                        </button>
                        <button
                          className="btn btn-danger-ghost btn-sm"
                          onClick={() => openRejectDialog(b._id)}
                          type="button"
                          disabled={actioningId === b._id}
                          aria-label={`Tu choi ${b.displayName}`}
                        >
                          Tu choi
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
              Trang {page} / {totalPages} · {total.toLocaleString('vi-VN')} ho so
            </span>
            <div className="pagination-controls">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setRequestedPage(page - 1)}
                disabled={page <= 1}
                type="button"
                aria-label="Trang truoc"
              >
                Truoc
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

      {/* Approve confirmation dialog */}
      <Dialog
        open={approveTarget !== null}
        onClose={() => { setApproveTarget(null); setApproveError(null); }}
        labelId="approve-dialog-title"
        variant="dialog"
      >
        <div className="dialog">
          <div className="dialog-header">
            <div>
              <h2 id="approve-dialog-title" className="panel-title">Xac nhan duyet</h2>
              <p className="panel-subtitle">
                {approvingBusiness
                  ? `Ban co chac muon duyet "${approvingBusiness.displayName}"?`
                  : 'Xac nhan duyet doanh nghiep nay?'}
              </p>
            </div>
          </div>
          <div className="dialog-body">
            {approveError && (
              <p className="alert" role="alert">
                {approveError}
              </p>
            )}
            <div className="table-actions">
              <button
                className="btn btn-primary"
                onClick={confirmApprove}
                type="button"
                disabled={actioningId !== null}
              >
                {actioningId ? 'Dang xu ly...' : 'Xac nhan duyet'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => { setApproveTarget(null); setApproveError(null); }}
                type="button"
                disabled={actioningId !== null}
              >
                Huy
              </button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Reject dialog */}
      <Dialog
        open={rejectTarget !== null}
        onClose={() => {
          setRejectTarget(null);
          setRejectError(null);
        }}
        labelId="reject-dialog-title"
        variant="dialog"
      >
        <div className="dialog">
          <div className="dialog-header">
            <div>
              <div className="page-eyebrow">Reject business</div>
              <h2 id="reject-dialog-title" className="panel-title">Ly do tu choi</h2>
              <p className="panel-subtitle">
                {rejectingBusiness
                  ? `Gui phan hoi ro rang cho ${rejectingBusiness.displayName}.`
                  : 'Gui phan hoi ro rang de doanh nghiep co the nop lai dung.'}
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
              Dong
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
                Ly do
              </label>
              <textarea
                className="textarea"
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                aria-label="Nhap ly do tu choi"
                aria-required="true"
                placeholder="Nhap ly do cu the de doanh nghiep biet can sua gi..."
              />
            </div>
            {rejectError && (
              <p className="alert" role="alert">
                {rejectError}
              </p>
            )}
            <div className="table-actions">
              <button
                className="btn btn-danger"
                onClick={handleRejectSubmit}
                type="button"
                disabled={rejectSubmitting}
              >
                {rejectSubmitting ? 'Dang gui...' : 'Xac nhan tu choi'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectError(null);
                }}
                type="button"
              >
                Huy
              </button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
