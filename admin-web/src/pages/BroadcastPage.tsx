import { useState } from 'react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';

export default function BroadcastPage() {
  const { addToast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try { await apiClient.post('/admin/broadcast', { title, body }); addToast('success', 'Đã gửi broadcast'); setTitle(''); setBody(''); setConfirm(false); } catch { addToast('error', 'Gửi thất bại'); } finally { setBusy(false); }
  }
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Vận hành" title="Broadcast" description="Gửi thông báo hệ thống tới tất cả client." />
      <section className="panel"><div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div className="form-field"><label className="form-label" htmlFor="bc-title">Tiêu đề</label><input className="input" id="bc-title" value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div className="form-field"><label className="form-label" htmlFor="bc-body">Nội dung</label><textarea className="textarea" id="bc-body" value={body} onChange={e => setBody(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={() => setConfirm(true)} disabled={!title.trim() || !body.trim()} type="button">Gửi broadcast</button>
      </div></section>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Xác nhận gửi broadcast" description={`Gửi "${title}" tới toàn bộ hệ thống?`} confirmLabel="Gửi" onConfirm={send} busy={busy} variant="primary" />
    </div>
  );
}
