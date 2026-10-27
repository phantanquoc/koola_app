import { useEffect, useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { apiErrorMessage, formatNumber } from '../components/formatters';

const TITLE_MAX = 120;
const BODY_MAX = 1000;

interface Stats {
  totalPersonal: number;
  totalBusiness: number;
}

export default function BroadcastPage() {
  const { addToast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Số người nhận là chốt an toàn của broadcast (DESIGN.md §A2) — tải cùng
  // trang để preview trong confirm luôn có số thật, không chờ tới lúc bấm gửi.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Stats>('/admin/stats')
      .then((res) => {
        if (!cancelled) {
          setTotal((res.data.totalPersonal ?? 0) + (res.data.totalBusiness ?? 0));
        }
      })
      .catch(() => {
        if (!cancelled) setTotal(null);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function send() {
    setBusy(true);
    try {
      const res = await apiClient.post<{ recipients?: number }>('/admin/broadcast', { title, body });
      const recipients = res.data?.recipients;
      addToast(
        'success',
        typeof recipients === 'number'
          ? `Đã gửi broadcast tới ${formatNumber(recipients)} thiết bị đang kết nối.`
          : 'Đã gửi broadcast.',
      );
      setTitle('');
      setBody('');
      setConfirm(false);
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Gửi broadcast thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  const empty = !title.trim() || !body.trim();

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Vận hành" title="Broadcast" description="Gửi thông báo hệ thống tới tất cả client." />
      <section className="panel"><div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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
        <button className="btn btn-primary" onClick={() => setConfirm(true)} disabled={empty} type="button">Gửi broadcast</button>
      </div></section>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Gửi broadcast tới toàn hệ thống?"
        description="Thông báo tới mọi tài khoản đang dùng hệ thống. Broadcast không thu hồi được — kiểm tra kỹ trước khi gửi."
        confirmLabel="Gửi broadcast"
        variant="danger"
        busy={busy}
        requireText="XACNHAN"
        onConfirm={send}
        preview={(
          <dl className="description-list">
            <div><dt>Người nhận</dt><dd>{statsLoading ? 'Đang đếm tài khoản…' : total === null ? 'Không tải được số tài khoản' : `Gửi tới toàn bộ ${formatNumber(total)} tài khoản đang dùng hệ thống.`}</dd></div>
            <div><dt>Tiêu đề</dt><dd>{title}</dd></div>
            <div><dt>Nội dung</dt><dd>{body}</dd></div>
          </dl>
        )}
      />
    </div>
  );
}
