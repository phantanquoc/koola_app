import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../apiClient';
import { ListHeader } from '../components/ListHeader';
import { StatusTabs } from '../components/StatusTabs';
import { FilterPopover } from '../components/FilterPopover';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import MetricCard from '../components/MetricCard';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { formatDateTime, formatNumber, apiErrorMessage } from '../components/formatters';
import Dialog from '../components/Dialog';
import { UserPicker, type UserOption } from '../components/UserPicker';
import { useToast } from '../components/Toast';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { isoToDay, dayToIso, dayLabel } from '../components/date-range';
import './admin-new-pages.css';

/**
 * Nhật ký vận hành: OTP/SMS và push/FCM.
 *
 * SĐT đã được server che (`091•••78`) — hiển thị nguyên văn, không bọc
 * MaskedPII: che lần hai chỉ còn "•••" và mất luôn đầu số để nhận diện.
 */

type LogTab = 'otp' | 'push';

interface OtpLog {
  _id: string;
  phone: string;
  channel: 'sms' | 'email' | string;
  purpose: string;
  success: boolean;
  error: string | null;
  provider: string;
  createdAt: string;
}

interface PushLog {
  _id: string;
  userId: string;
  tokenCount: number;
  successCount: number;
  failureCount: number;
  title: string;
  body: string;
  kind: string;
  createdAt: string;
}

interface OtpResponse {
  data: OtpLog[];
  total: number;
  page: number;
  limit: number;
  stats: { total: number; success: number; failed: number; successRate: number };
}

interface PushResponse {
  data: PushLog[];
  total: number;
  page: number;
  limit: number;
  stats: { total: number; tokenCount: number; successCount: number; failureCount: number; deliveryRate: number };
}

const PAGE_SIZES = [20, 50, 100];
const DEFAULT_FILTERS = { tab: 'otp', success: '', kind: '', from: '', to: '', page: '1', pageSize: '20' };

/** `kind` do backend ghi tự do; đây là các giá trị đang có trong code. */
const PUSH_KINDS = [
  { value: 'message', label: 'Tin nhắn' },
  { value: 'broadcast', label: 'Broadcast' },
  { value: 'admin_test', label: 'Push thử' },
  { value: 'report', label: 'Báo cáo' },
];

interface TestPushResult {
  tokenCount: number;
  successCount: number;
  failureCount: number;
  skipped?:
    | 'no_user'
    | 'notifications_disabled'
    | 'no_tokens'
    | 'fcm_not_configured';
}

/**
 * Diễn giải kết quả gửi thử.
 *
 * `tone` theo **hệ quả với người bấm nút**, không theo "có gửi được hay không":
 * tài khoản không có thiết bị là chuyện bình thường (chưa cài app), không phải
 * lỗi — tô đỏ nó làm admin đi tìm sự cố không tồn tại.
 */
function describeTestPush(r: TestPushResult): {
  tone: 'success' | 'warning' | 'danger';
  badge: string;
  text: string;
} {
  switch (r.skipped) {
    case 'no_user':
      return {
        tone: 'danger',
        badge: 'Sai id',
        text: 'Không có tài khoản nào với id này. Kiểm tra lại mã trước khi gửi.',
      };
    case 'notifications_disabled':
      return {
        tone: 'warning',
        badge: 'Không gửi',
        text: 'Tài khoản này đã tắt nhận thông báo trong cài đặt — tôn trọng lựa chọn, không gửi.',
      };
    case 'no_tokens':
      return {
        tone: 'warning',
        badge: 'Không gửi',
        text: 'Tài khoản chưa đăng ký thiết bị nào. Họ cần mở app và đăng nhập trước.',
      };
    case 'fcm_not_configured':
      return {
        tone: 'warning',
        badge: 'Chưa cấu hình',
        text: 'Máy chủ chưa có khoá Firebase (FIREBASE_PRIVATE_KEY) — lỗi cấu hình deploy, không phải lỗi thiết bị.',
      };
    default:
      if (r.successCount > 0) {
        return {
          tone: 'success',
          badge: 'Đã giao',
          text: `${r.successCount}/${r.tokenCount} thiết bị nhận được thông báo.`,
        };
      }
      return {
        tone: 'danger',
        badge: 'Thất bại',
        text: `Cả ${r.tokenCount} thiết bị đều lỗi — kiểm tra cấu hình Firebase hoặc token đã hết hạn.`,
      };
  }
}

const CHANNEL_LABEL: Record<string, string> = { sms: 'SMS', email: 'Email' };
const PURPOSE_LABEL: Record<string, string> = {
  register: 'Đăng ký',
  login: 'Đăng nhập',
  reset_password: 'Đặt lại mật khẩu',
  phone_change: 'Đổi số điện thoại',
  otp: 'OTP',
};

const TABS = [
  { key: 'otp', label: 'OTP / SMS' },
  { key: 'push', label: 'Push' },
];


function percent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export default function OpsLogPage() {
  const { values, set, reset } = useUrlFilters(DEFAULT_FILTERS);
  const { addToast } = useToast();
  const [testOpen, setTestOpen] = useState(false);
  const [testForm, setTestForm] = useState({ title: '', body: '' });
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<TestPushResult | null>(null);
  /**
   * Người nhận chọn từ `UserPicker` — không gõ id tay. Gửi push là thao tác chạm
   * thiết bị thật nên phải chọn từ danh sách thật, không phải dán chuỗi hex.
   */
  const [testTarget, setTestTarget] = useState<UserOption[]>([]);
  const tab: LogTab = values.tab === 'push' ? 'push' : 'otp';
  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;

  // Ô "Loại push" gõ tự do: debounce để không bắn một query mỗi ký tự.
  const [kindInput, setKindInput] = useState(values.kind);
  useEffect(() => setKindInput(values.kind), [values.kind]);
  useEffect(() => {
    if (kindInput.trim() === values.kind) return;
    const t = setTimeout(() => set({ kind: kindInput.trim(), page: '1' }), 400);
    return () => clearTimeout(t);
  }, [kindInput, values.kind, set]);

  const params = useMemo(() => ({
    page,
    limit: pageSize,
    from: values.from || undefined,
    to: values.to || undefined,
    ...(tab === 'otp'
      ? { success: values.success || undefined }
      : { kind: values.kind.trim() || undefined }),
  }), [page, pageSize, values.from, values.to, values.success, values.kind, tab]);

  const query = useQuery({
    queryKey: ['ops-logs', tab, values.success, values.kind, values.from, values.to, page, pageSize],
    queryFn: async () =>
      tab === 'otp'
        ? (await apiClient.get<OtpResponse>('/admin/otp-logs', { params })).data
        : (await apiClient.get<PushResponse>('/admin/push-logs', { params })).data,
  });

  const { data, isLoading, isError, error, refetch } = query;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Filter của tab kia không được tính là "đang lọc" — nếu không badge Bộ lọc
  // hiện số mà bảng chẳng lọc gì, và nút "Xoá bộ lọc" không xoá được nó.
  const tabFilter = tab === 'otp' ? values.success : values.kind;
  const hasFilter = Boolean(tabFilter || values.from || values.to);
  const advancedCount = (tabFilter ? 1 : 0) + (values.from || values.to ? 1 : 0);

  // `type="date"` chỉ nói ngày; biên trên lấy 23:59:59.999 để bao trọn hôm nay.
  function setDay(key: 'from' | 'to', day: string) {
    set({ [key]: dayToIso(day, key), page: '1' });
  }

  function switchTab(next: string) {
    // success chỉ có nghĩa ở tab OTP, kind chỉ ở tab Push — đổi tab phải xoá
    // filter của tab cũ, không thì bảng rỗng mà không rõ vì sao.
    set({ tab: next === 'otp' ? '' : next, success: '', kind: '', page: '1' });
  }

  async function submitTestPush() {
    if (testBusy) return;
    setTestBusy(true);
    setTestResult(null);
    try {
      const res = await apiClient.post<TestPushResult>('/admin/push-logs/test', {
        userId: testTarget[0].id,
        title: testForm.title.trim(),
        body: testForm.body.trim(),
      });
      setTestResult(res.data);
      const meta = describeTestPush(res.data);
      addToast(meta.tone === 'success' ? 'success' : 'warning', meta.text);
      if (res.data.successCount > 0) void refetch();
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Gửi thử thất bại. Vui lòng thử lại.'));
    } finally {
      setTestBusy(false);
    }
  }

  const otpStats = tab === 'otp' ? (data as OtpResponse | undefined)?.stats : undefined;
  const pushStats = tab === 'push' ? (data as PushResponse | undefined)?.stats : undefined;

  return (
    <div className="page-stack">
      <ListHeader
        title="Nhật ký vận hành"
        count={total}
        actions={(
          <>
            {tab === 'push' && (
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setTestResult(null); setTestOpen(true); }}>
                Gửi thử
              </button>
            )}
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Làm mới</button>
          </>
        )}
      >
        <FilterPopover
          activeCount={advancedCount}
          onClear={() => set({ success: '', kind: '', from: '', to: '', page: '1' })}
        >
          {tab === 'otp' ? (
            <label className="form-field">
              <span className="form-label">Kết quả gửi</span>
              <select
                className="select" value={values.success}
                onChange={(e) => set({ success: e.target.value, page: '1' })}
              >
                <option value="">Mọi kết quả</option>
                <option value="true">Gửi thành công</option>
                <option value="false">Gửi thất bại</option>
              </select>
            </label>
          ) : (
            <label className="form-field">
              <span className="form-label">Loại push</span>
              {/* Server chỉ lọc theo `kind` (mọi "lần gửi trượt" không lọc được).
                  Gợi ý các kind đang có trong code nhưng vẫn cho gõ kind mới —
                  backend thêm kind mới không phải sửa trang này. */}
              <input
                className="input" type="text" value={kindInput} maxLength={40}
                list="ops-push-kinds" placeholder="Mọi loại"
                onChange={(e) => setKindInput(e.target.value)}
              />
              <datalist id="ops-push-kinds">
                {PUSH_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </datalist>
            </label>
          )}

          <div className="form-field">
            <span className="form-label">Khoảng thời gian</span>
            <div className="filter-date-range">
              <input
                className="input input-sm" type="date" value={isoToDay(values.from)}
                max={isoToDay(values.to) || undefined}
                onChange={(e) => setDay('from', e.target.value)} aria-label="Từ ngày"
              />
              <span className="cell-meta" aria-hidden>→</span>
              <input
                className="input input-sm" type="date" value={isoToDay(values.to)}
                min={isoToDay(values.from) || undefined}
                onChange={(e) => setDay('to', e.target.value)} aria-label="Đến ngày"
              />
            </div>
          </div>
        </FilterPopover>
      </ListHeader>

      <div className="filter-bar">
        <StatusTabs tabs={TABS} active={tab} onChange={switchTab} />
        <span className="cell-meta">Log tự xoá sau 90 ngày</span>
      </div>

      {hasFilter && (
        <div className="filter-chip-row context-row" aria-label="Bộ lọc đang áp dụng">
          {values.success && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ success: '', page: '1' })}>
              {values.success === 'true' ? 'Gửi thành công' : 'Gửi thất bại'} ✕
            </button>
          )}
          {values.kind && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ kind: '', page: '1' })}>
              Loại: {values.kind} ✕
            </button>
          )}
          {(values.from || values.to) && (
            <button className="filter-chip filter-chip-removable" type="button" onClick={() => set({ from: '', to: '', page: '1' })}>
              {values.from ? dayLabel(values.from) : '…'} → {values.to ? dayLabel(values.to) : '…'} ✕
            </button>
          )}
          <button className="btn btn-ghost btn-sm" type="button" onClick={reset}>Xoá bộ lọc</button>
        </div>
      )}

      {tab === 'otp' && otpStats && (
        <section className="grid grid-4" aria-label="Chỉ số gửi OTP">
          <MetricCard icon="✉" label="Lượt gửi" value={otpStats.total} helper={`Tỉ lệ thành công ${percent(otpStats.successRate)}`} tone={otpStats.successRate < 0.9 ? 'warning' : undefined} />
          <MetricCard icon="✓" label="Thành công" value={otpStats.success} helper="Đã gửi tới nhà cung cấp" tone="success" />
          <MetricCard icon="!" label="Thất bại" value={otpStats.failed} helper="Xem cột Lỗi để biết nguyên nhân" tone={otpStats.failed > 0 ? 'danger' : undefined} />
          <MetricCard icon="%" label="Tỉ lệ thành công" value={percent(otpStats.successRate)} helper="Tính trên toàn bộ log khớp bộ lọc" />
        </section>
      )}
      {tab === 'push' && pushStats && (
        <section className="grid grid-4" aria-label="Chỉ số gửi push">
          <MetricCard icon="🔔" label="Lượt gửi" value={pushStats.total} helper={`${formatNumber(pushStats.tokenCount)} token đã thử`} />
          <MetricCard icon="✓" label="Token thành công" value={pushStats.successCount} helper={`Tỉ lệ giao ${percent(pushStats.deliveryRate)}`} tone="success" />
          <MetricCard icon="!" label="Token lỗi" value={pushStats.failureCount} helper="Token chết hoặc FCM từ chối" tone={pushStats.failureCount > 0 ? 'danger' : undefined} />
          <MetricCard icon="%" label="Tỉ lệ giao" value={percent(pushStats.deliveryRate)} helper="Tính trên số token đã thử" />
        </section>
      )}

      <TableShell>
        {isError && (
          <StateBlock variant="error" title="Không tải được nhật ký" copy={apiErrorMessage(error, 'Kiểm tra kết nối rồi thử lại.')}>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Thử lại</button>
          </StateBlock>
        )}
        {isLoading && <StateBlock variant="loading" title="Đang tải nhật ký" copy="Đang lấy log vận hành." />}
        {!isLoading && !isError && tab === 'otp' && (
          <div className="table-scroll table-scroll--fit">
            <table className="data-table data-table--compact" aria-label="Nhật ký gửi OTP">
              <thead>
                <tr>
                  <th scope="col">Thời gian</th>
                  <th scope="col">Người nhận</th>
                  <th scope="col" className="col-hide-mobile">Kênh / mục đích</th>
                  <th scope="col">Kết quả</th>
                  <th scope="col" className="col-hide-mobile">Nhà cung cấp</th>
                </tr>
              </thead>
              <tbody>
                {(data as OtpResponse | undefined)?.data.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        title={hasFilter ? 'Không khớp lượt gửi nào' : 'Chưa có lượt gửi OTP'}
                        copy={hasFilter
                          ? 'Bộ lọc hiện tại không khớp. Gỡ bớt điều kiện để xem thêm.'
                          : 'Log sẽ xuất hiện ở đây khi hệ thống gửi OTP.'}
                        action={hasFilter ? <button className="btn btn-secondary btn-sm" type="button" onClick={reset}>Xoá bộ lọc</button> : undefined}
                      />
                    </td>
                  </tr>
                )}
                {(data as OtpResponse | undefined)?.data.map((r) => (
                  <tr key={r._id}>
                    <td><span className="cell-date k-mono">{formatDateTime(r.createdAt)}</span></td>
                    {/* SĐT đã che từ server — hiện nguyên văn. */}
                    <td>
                      <div className="cell-title k-mono">{r.phone}</div>
                      <div className="cell-meta show-under-860">{CHANNEL_LABEL[r.channel] ?? r.channel} · {PURPOSE_LABEL[r.purpose] ?? r.purpose} · {r.provider}</div>
                    </td>
                    <td className="col-hide-mobile">
                      <div className="cell-title">{CHANNEL_LABEL[r.channel] ?? r.channel}</div>
                      <div className="cell-meta">{PURPOSE_LABEL[r.purpose] ?? r.purpose}</div>
                    </td>
                    <td>
                      {r.success
                        ? <StatusBadge tone="success" label="Thành công" />
                        : <StatusBadge tone="danger" label="Thất bại" />}
                      {!r.success && r.error && <div className="cell-meta">{r.error}</div>}
                    </td>
                    <td className="col-hide-mobile"><span className="cell-meta">{r.provider}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && !isError && tab === 'push' && (
          <div className="table-scroll table-scroll--fit">
            <table className="data-table data-table--compact" aria-label="Nhật ký gửi push">
              <thead>
                <tr>
                  <th scope="col">Thời gian</th>
                  <th scope="col">Nội dung</th>
                  <th scope="col" className="col-hide-mobile">Người nhận</th>
                  <th scope="col">Token</th>
                  <th scope="col" className="col-hide-mobile">Loại</th>
                </tr>
              </thead>
              <tbody>
                {(data as PushResponse | undefined)?.data.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        title={hasFilter ? 'Không khớp lượt gửi nào' : 'Chưa có lượt gửi push'}
                        copy={hasFilter
                          ? 'Bộ lọc hiện tại không khớp. Gỡ bớt điều kiện để xem thêm.'
                          : 'Log sẽ xuất hiện ở đây khi hệ thống gửi thông báo đẩy.'}
                        action={hasFilter ? <button className="btn btn-secondary btn-sm" type="button" onClick={reset}>Xoá bộ lọc</button> : undefined}
                      />
                    </td>
                  </tr>
                )}
                {(data as PushResponse | undefined)?.data.map((r) => (
                  <tr key={r._id}>
                    <td><span className="cell-date k-mono">{formatDateTime(r.createdAt)}</span></td>
                    <td>
                      <div className="cell-title">{r.title || '(không có tiêu đề)'}</div>
                      <div className="cell-meta">{r.body || '—'}</div>
                      <div className="cell-meta show-under-860">Người nhận: <span className="k-mono">{r.userId}</span> · Loại: {r.kind}</div>
                    </td>
                    <td className="col-hide-mobile"><span className="k-mono cell-meta">{r.userId}</span></td>
                    <td>
                      {/* 0 token là lý do phổ biến khiến push trượt — nói thẳng. */}
                      <div className="cell-title">{r.successCount}/{r.tokenCount}</div>
                      <div className="cell-meta">
                        {r.failureCount > 0
                          ? <StatusBadge tone="warning" label={`${r.failureCount} lỗi`} />
                          : r.tokenCount === 0
                            ? <StatusBadge tone="muted" label="Không có token" />
                            : <StatusBadge tone="success" label="Đã giao" />}
                      </div>
                    </td>
                    <td className="col-hide-mobile"><span className="cell-meta">{r.kind}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page} totalPages={totalPages} total={total} unit="lượt gửi"
          onPageChange={(p) => set({ page: String(p) })}
          showGoto pageSize={pageSize} pageSizes={PAGE_SIZES}
          onPageSizeChange={(n) => set({ pageSize: String(n), page: '1' })}
        />
      </TableShell>

      {/* Gửi thử: kiểm kênh FCM sau khi đổi cấu hình. Không dùng ConfirmDialog
          vì cần 3 ô nhập + vùng kết quả, không phải một câu xác nhận. */}
      <Dialog
        open={testOpen}
        onClose={() => { setTestOpen(false); setTestResult(null); setTestTarget([]); }}
        labelId="test-push-title"
        variant="dialog"
      >
        <div className="dialog">
          <div className="dialog-header">
            <div>
              <h2 id="test-push-title" className="panel-title">Gửi push thử</h2>
              <p className="panel-subtitle">
                Kiểm kênh FCM sau khi đổi cấu hình. Người đang online vẫn nhận —
                mục đích là kiểm thiết bị, không phải thông báo.
              </p>
            </div>
          </div>
          <div className="dialog-body page-stack">
            <UserPicker
              label="Tài khoản nhận"
              inputId="test-push-user"
              value={testTarget}
              onChange={(next) => setTestTarget(next.slice(0, 1))}
              max={1}
              placeholder="Tìm theo tên, email, SĐT hoặc username"
              hint="Chọn đúng một tài khoản. Push đi tới mọi thiết bị đã đăng ký của người đó."
            />

            <label className="form-field">
              <span className="form-label">
                Tiêu đề
                <span className="form-counter">{testForm.title.length}/200</span>
              </span>
              <input
                className="input" value={testForm.title} maxLength={200}
                onChange={(e) => setTestForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Koola Admin — kiểm tra"
              />
            </label>
            <label className="form-field">
              <span className="form-label">
                Nội dung
                <span className="form-counter">{testForm.body.length}/2000</span>
              </span>
              <textarea
                className="textarea" rows={3} value={testForm.body} maxLength={2000}
                onChange={(e) => setTestForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Đây là push thử từ trang vận hành."
              />
            </label>

            {testResult && (() => {
              const meta = describeTestPush(testResult);
              return (
                <div
                  className={`test-push-result test-push-result--${meta.tone}`}
                  role="status"
                  data-testid="test-push-result"
                >
                  <StatusBadge tone={meta.tone} label={meta.badge} />
                  <span>{meta.text}</span>
                </div>
              );
            })()}

            <div className="dialog-actions">
              <button
                className="btn btn-secondary" type="button"
                onClick={() => { setTestOpen(false); setTestResult(null); setTestTarget([]); }}
              >
                Đóng
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={
                  testBusy ||
                  testTarget.length === 0 ||
                  !testForm.title.trim() ||
                  !testForm.body.trim()
                }
                onClick={() => void submitTestPush()}
              >
                {testBusy ? 'Đang gửi...' : 'Gửi thử'}
              </button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
