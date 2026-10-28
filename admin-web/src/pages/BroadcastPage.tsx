import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import { Pagination } from '../components/Pagination';
import { ConfirmDialog } from '../components/ConfirmDialog';
import StateBlock from '../components/StateBlock';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { apiErrorMessage, formatDateTime, formatNumber } from '../components/formatters';
import { useAdminList } from '../hooks/useAdminList';
import { UserPicker, type UserOption } from '../components/UserPicker';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { useAuth } from '../useAuth';
import './broadcast.css';

const TITLE_MAX = 120;
const BODY_MAX = 1000;
const IDS_MAX = 500;
const PAGE_SIZES = [20, 50, 100];

type Audience = 'all' | 'personal' | 'business' | 'ids';

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'personal', label: 'Cá nhân' },
  { value: 'business', label: 'Doanh nghiệp' },
  { value: 'ids', label: 'Chọn người dùng' },
];

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: 'Tất cả tài khoản',
  personal: 'Tài khoản cá nhân',
  business: 'Tài khoản doanh nghiệp',
  ids: 'Danh sách người dùng chọn tay',
};

interface Stats {
  totalPersonal: number;
  totalBusiness: number;
}



interface BroadcastLog {
  _id: string;
  title: string;
  body: string;
  audience: Audience;
  audienceIds: string[];
  sentBy: string;
  /** Tên người gửi resolve ở server — hiện tại backend chỉ trả actorId. */
  sentByName?: string;
  recipientsOnline: number;
  /** Số thiết bị nhận push cho người offline; 0 với audience không có danh sách. */
  pushDelivered?: number;
  createdAt: string;
}

interface BroadcastResponse {
  recipients?: number;
  /** Số thiết bị nhận push cho người không có socket (chỉ audience=ids). */
  pushDelivered?: number;
  /** Lý do không đẩy được push — nói rõ thay vì im lặng. */
  pushSkipped?: 'no_recipient_list' | 'fcm_not_configured';
  audience?: Audience;
}

function shortId(id: string) {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export default function BroadcastPage() {
  const { addToast } = useToast();
  const { identity } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  // UserPicker giữ cả id và tên; `label` cũ chỉ có id rút gọn nên bảng xác
  // nhận toàn mã hex — người gửi không đọc được mình đang gửi cho ai.
  const [recipients, setRecipients] = useState<UserOption[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const { values, set } = useUrlFilters({ page: '1', pageSize: '20' });
  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(values.pageSize)) ? Number(values.pageSize) : 20;

  const history = useAdminList<BroadcastLog>(
    ['broadcast-history', page, pageSize],
    '/admin/broadcast-history',
    { page, limit: pageSize },
    { refetchOnWindowFocus: false },
  );
  const totalPages = Math.max(1, Math.ceil(history.total / pageSize));

  // Số người nhận là chốt an toàn của broadcast (DESIGN.md §A2) — tải cùng
  // trang để preview trong confirm luôn có số thật, không chờ tới lúc bấm gửi.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Stats>('/admin/stats')
      .then((res) => {
        if (!cancelled) setStats(res.data);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Ước tính người nhận theo đối tượng: "ids" đếm chip, còn lại lấy từ stats.
  // Con số chỉ là bậc độ lớn — stats đếm tài khoản, không phải socket online.
  const estimateText = useMemo(() => {
    if (audience !== 'ids' && statsLoading) return 'đang đếm tài khoản…';
    if (audience === 'ids') return `${formatNumber(recipients.length)} người đã chọn`;
    if (!stats) return 'không tải được số tài khoản';
    const n = audience === 'personal'
      ? stats.totalPersonal
      : audience === 'business'
        ? stats.totalBusiness
        : (stats.totalPersonal ?? 0) + (stats.totalBusiness ?? 0);
    return `khoảng ${formatNumber(n)} tài khoản`;
  }, [audience, recipients.length, stats, statsLoading]);

  async function send() {
    setBusy(true);
    try {
      const res = await apiClient.post<BroadcastResponse>('/admin/broadcast', {
        title,
        body,
        audience,
        audienceIds: audience === 'ids' ? recipients.map((r) => r.id) : [],
      });
      const delivered = res.data?.recipients;
      const pushed = res.data?.pushDelivered ?? 0;
      const skipped = res.data?.pushSkipped;
      if (typeof delivered !== 'number') {
        addToast('success', 'Đã gửi broadcast.');
      } else if (pushed > 0) {
        addToast(
          'success',
          `Đã gửi tới ${formatNumber(delivered)} người đang online và ${formatNumber(pushed)} thiết bị của người offline.`,
        );
      } else if (skipped === 'fcm_not_configured') {
        addToast(
          'warning',
          `Đã gửi tới ${formatNumber(delivered)} người đang online. Push chưa gửi được: máy chủ chưa cấu hình FCM.`,
        );
      } else {
        // no_recipient_list: audience đếm theo socket nên không biết ai offline.
        addToast(
          'success',
          `Đã gửi tới ${formatNumber(delivered)} người đang online. Người offline không nhận được — chọn "Chọn người dùng" nếu cần họ cũng nhận.`,
        );
      }
      setTitle('');
      setBody('');
      setRecipients([]);
      setConfirm(false);
      // Bản ghi mới nhất nằm ở trang 1: đang ở trang khác thì đổi trang (đổi
      // query key tự fetch), đang ở trang 1 thì refetch tại chỗ.
      if (page === 1) await history.refetch();
      else set({ page: '1' });
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Gửi broadcast thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  function senderLabel(log: BroadcastLog) {
    if (log.sentByName) return log.sentByName;
    return identity?.id && log.sentBy === identity.id ? 'Bạn' : shortId(log.sentBy);
  }

  function logAudience(log: BroadcastLog) {
    const label = AUDIENCE_LABEL[log.audience] ?? log.audience;
    return log.audience === 'ids' ? `${label} (${log.audienceIds?.length ?? 0})` : label;
  }

  const blockedByAudience = audience === 'ids' && recipients.length === 0;
  const empty = !title.trim() || !body.trim() || blockedByAudience;
  const loadError = apiErrorMessage(history.error, 'Không tải được lịch sử broadcast.');

  return (
    <div className="page-stack">
      <PageHeader
        title="Thông báo"
        description="Gửi thông báo hệ thống tới nhóm người dùng đã chọn."
      />

      {/* Copy phải khớp hành vi hiện tại: `ids` có push cho người offline, ba loại
          còn lại thì không (đếm theo socket). Câu cũ nói "chưa có FCM fallback" —
          sai từ khi push fallback được thêm vào. */}
      <p className="bc-note" role="note">
        <Info size={16} aria-hidden />
        <span>
          <strong>Tất cả / Cá nhân / Doanh nghiệp</strong> chỉ tới người đang mở app.
          Chọn <strong>Chọn người dùng</strong> nếu người offline cũng phải nhận —
          nhóm đó có gửi push.
        </span>
      </p>

      <section className="panel">
        <div className="panel-body bc-form">
          <div className="form-field">
            <label className="form-label" htmlFor="bc-title">Tiêu đề</label>
            <input className="input" id="bc-title" value={title} maxLength={TITLE_MAX} onChange={e => setTitle(e.target.value)} />
            <span className="form-hint">{title.length}/{TITLE_MAX} ký tự</span>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="bc-body">Nội dung</label>
            <textarea className="textarea" id="bc-body" value={body} maxLength={BODY_MAX} onChange={e => setBody(e.target.value)} />
            <span className="form-hint">{body.length}/{BODY_MAX} ký tự</span>
          </div>

          <div className="form-field">
            <span className="form-label" id="bc-audience-label">Đối tượng nhận</span>
            {/* Nút bật/tắt trong group thay vì role=radio: radio group chuẩn ARIA
                bắt buộc điều hướng bằng mũi tên — làm nửa vời còn tệ hơn. */}
            <div className="tabs bc-audience" role="group" aria-labelledby="bc-audience-label">
              {AUDIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={audience === opt.value}
                  onClick={() => setAudience(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="form-hint">
              {audience === 'ids'
                ? `Chỉ gửi cho đúng ${formatNumber(recipients.length)} người trong danh sách bên dưới.`
                : `Ước tính ${estimateText}.`}
            </span>
            {(audience === 'personal' || audience === 'business') && (
              // Gateway join room `account:<loại>` lúc handshake; BroadcastService
              // emit đúng room đó. Chỉ người ĐANG ONLINE trong nhóm nhận được —
              // nhóm này không có danh sách người nên không push cho offline.
              <span className="form-hint">
                Chỉ người đang mở app thuộc nhóm này nhận được. Muốn người offline cũng
                nhận thì chọn “Chọn người dùng”.
              </span>
            )}
          </div>

          {audience === 'ids' && (
            <UserPicker
              label="Người nhận"
              inputId="bc-ids-input"
              value={recipients}
              onChange={setRecipients}
              max={IDS_MAX}
              placeholder="Tìm theo tên, email, SĐT hoặc @username"
              hint={`Chọn từ danh sách để không gửi nhầm. Tối đa ${IDS_MAX} người — người offline trong danh sách vẫn nhận qua push.`}
            />
          )}

          <div>
            <button
              className="btn btn-primary"
              onClick={() => setConfirm(true)}
              disabled={empty}
              type="button"
            >
              Gửi broadcast
            </button>
          </div>
        </div>
      </section>

      <TableShell title="Đã gửi" subtitle="Lịch sử gửi thông báo, mới nhất trước.">
        {history.isError && (
          <StateBlock variant="error" title="Không tải được lịch sử" copy={loadError}>
            <button className="btn btn-secondary btn-sm" onClick={() => history.refetch()} type="button">Thử lại</button>
          </StateBlock>
        )}
        {history.isLoading && (
          <StateBlock variant="loading" title="Đang tải lịch sử" copy="Đang lấy lịch sử thông báo đã gửi." />
        )}
        {!history.isLoading && !history.isError && (
          <div className="table-scroll table-scroll--fit">
            <table className="data-table data-table--compact" aria-label="Lịch sử gửi thông báo">
              <thead>
                <tr>
                  <th scope="col">Thời điểm</th>
                  <th scope="col">Tiêu đề</th>
                  <th scope="col" className="col-hide-mobile">Đối tượng</th>
                  <th scope="col" className="bc-col-num">Online</th>
                  <th scope="col" className="bc-col-num col-hide-mobile">Push</th>
                  <th scope="col" className="col-hide-xs">Người gửi</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        title="Chưa gửi broadcast nào"
                        copy="Mỗi lần gửi thành công sẽ được ghi ở đây để đối soát."
                      />
                    </td>
                  </tr>
                )}
                {history.rows.map((log) => (
                  <tr key={log._id}>
                    <td>
                      <span className="cell-date k-mono">{formatDateTime(log.createdAt)}</span>
                      <div className="cell-meta show-under-1100">{senderLabel(log)}</div>
                    </td>
                    <td>
                      <div className="cell-title">{log.title}</div>
                      <div className="cell-meta bc-log-body">{log.body}</div>
                    </td>
                    <td className="col-hide-mobile">{logAudience(log)}</td>
                    <td className="bc-col-num k-mono">
                      {formatNumber(log.recipientsOnline)}
                    </td>
                    {/* Field đã ghi trong DB từ khi có push fallback nhưng trước
                        đây không hiện → không đối soát được "đã push cho ai". */}
                    <td className="bc-col-num col-hide-mobile">
                      {log.pushDelivered && log.pushDelivered > 0
                        ? <span className="k-mono">{formatNumber(log.pushDelivered)}</span>
                        : log.audience === 'ids'
                          ? <span className="cell-meta">0</span>
                          : <span className="cell-meta" title="Audience này đếm theo socket, không biết ai offline để push">—</span>}
                    </td>
                    <td className="col-hide-xs">{senderLabel(log)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          total={history.total}
          unit="lần gửi"
          onPageChange={(p) => set({ page: String(p) })}
          showGoto
          pageSize={pageSize}
          pageSizes={PAGE_SIZES}
          onPageSizeChange={(n) => set({ pageSize: String(n), page: '1' })}
        />
      </TableShell>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Gửi broadcast tới ${AUDIENCE_LABEL[audience].toLowerCase()}?`}
        description={
          `Gửi tới ${AUDIENCE_LABEL[audience].toLowerCase()} — ${estimateText}. Broadcast không thu hồi được nên kiểm tra kỹ trước khi gửi.`
          + (audience === 'ids'
            ? ' Người đang offline trong danh sách vẫn nhận qua push nếu thiết bị đã đăng ký.'
            : ' Chỉ người đang online nhận được — chọn "Chọn người dùng" nếu cần cả người offline.')
        }
        confirmLabel="Gửi broadcast"
        variant="danger"
        busy={busy}
        requireText="XACNHAN"
        onConfirm={send}
        preview={(
          <dl className="description-list">
            <div><dt>Đối tượng</dt><dd>{AUDIENCE_LABEL[audience]}</dd></div>
            <div><dt>Người nhận ước tính</dt><dd>{estimateText}</dd></div>
            {audience === 'ids' && (
              <div>
                <dt>Danh sách</dt>
                <dd className="bc-preview-ids">
                  {recipients.map((r) => r.name).join(', ')}
                </dd>
              </div>
            )}
            <div><dt>Tiêu đề</dt><dd>{title}</dd></div>
            <div><dt>Nội dung</dt><dd>{body}</dd></div>
          </dl>
        )}
      />
    </div>
  );
}
