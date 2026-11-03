import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Play, Pause } from 'lucide-react';
import apiClient from '../apiClient';
import StateBlock from './StateBlock';
import { apiErrorMessage, formatDateTime, formatNumber } from './formatters';
import { auditActionLabel, auditActionTone } from './audit-labels';
import { StatusBadge } from './StatusBadge';
import { musicApi, durationLabel, licenseLabel, type MusicTrackDetail } from '../musicApi';

interface MusicDetailProps {
  id: string;
  /** Called after a successful deactivate/restore so the list can refresh. */
  onMutated?: () => void;
}

interface AuditEntry {
  _id: string;
  action: string;
  actorName?: string;
  createdAt: string;
  payload?: Record<string, unknown> | null;
}

/**
 * Music track detail — the only place a track's full record and playback exist.
 *
 * Presigned URLs are requested here on every mount (and once more on a playback
 * error) because they expire after an hour; holding one from list state would
 * be a stale URL by design.
 */
export default function MusicDetail({ id, onMutated }: MusicDetailProps) {
  const queryClient = useQueryClient();

  const trackQuery = useQuery({
    queryKey: ['music-detail', id],
    queryFn: () => musicApi.detail(id),
    retry: 1,
  });
  const track: MusicTrackDetail | undefined = trackQuery.data;

  // ─── Playback ──────────────────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const refetchedOnceRef = useRef(false);

  useEffect(() => {
    // A new id (or a refetched URL) resets the retry budget.
    refetchedOnceRef.current = false;
    setPlayError(null);
    setIsPlaying(false);
  }, [id, track?.audioUrl]);

  async function togglePlay() {
    const el = audioRef.current;
    if (!el || !track) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
      return;
    }
    setPlayError(null);
    if (el.src !== track.audioUrl) el.src = track.audioUrl;
    try {
      await el.play();
      setIsPlaying(true);
    } catch {
      // Expired URL is the common cause. Refetch exactly once, never loop.
      if (!refetchedOnceRef.current) {
        refetchedOnceRef.current = true;
        await trackQuery.refetch();
        return;
      }
      setPlayError('Không phát được bản nhạc — đường dẫn có thể đã hết hạn.');
    }
  }

  // ─── Metadata edit ─────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [attribution, setAttribution] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed the editable fields from the fetched track. Listing the individual
  // fields (not `track`) keeps a background refetch from clobbering the
  // operator's in-progress edits when the values are unchanged.
  useEffect(() => {
    if (!track) return;
    setTitle(track.title);
    setArtist(track.artist);
    setAttribution(track.attribution ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?._id, track?.title, track?.artist, track?.attribution]);

  // Only changed fields go up: sending the whole object would rewrite provenance
  // values the operator never touched.
  const patch = useMemo(() => {
    if (!track) return {};
    const out: Record<string, string> = {};
    if (title !== track.title) out.title = title;
    if (artist !== track.artist) out.artist = artist;
    if (attribution !== (track.attribution ?? '')) out.attribution = attribution;
    return out;
  }, [track, title, artist, attribution]);
  const dirty = Object.keys(patch).length > 0;

  async function save() {
    if (!dirty) return;
    setSaveError(null);
    setSaving(true);
    try {
      await musicApi.update(id, patch);
      setSaved(true);
      await trackQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ['music'] });
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Lưu thất bại'));
    } finally {
      setSaving(false);
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  const [confirmAction, setConfirmAction] = useState<'deactivate' | 'restore' | null>(null);
  const [busyLifecycle, setBusyLifecycle] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  async function runLifecycle() {
    if (!confirmAction) return;
    setLifecycleError(null);
    setBusyLifecycle(true);
    try {
      if (confirmAction === 'deactivate') await musicApi.deactivate(id);
      else await musicApi.restore(id);
      setConfirmAction(null);
      await trackQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ['music'] });
      void queryClient.invalidateQueries({ queryKey: ['music-stats'] });
      onMutated?.();
    } catch (err) {
      setLifecycleError(apiErrorMessage(err, 'Thao tác thất bại'));
    } finally {
      setBusyLifecycle(false);
    }
  }

  // ─── Audit trail ───────────────────────────────────────────────────────────
  // Filtered server-side by target; a client-side filter over a page of the log
  // would silently miss entries.
  const auditQuery = useQuery({
    queryKey: ['music-audit', id],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: AuditEntry[] }>('/admin/audit-logs', {
        params: { targetType: 'music_track', targetId: id, limit: 50 },
      });
      return data.data;
    },
    staleTime: 30_000,
  });

  if (trackQuery.isLoading) {
    return <StateBlock variant="loading" title="Đang tải track" copy="Đang lấy thông tin bản nhạc." />;
  }

  if (trackQuery.isError || !track) {
    return (
      <StateBlock
        variant="error"
        title="Không tải được track"
        copy={apiErrorMessage(trackQuery.error, 'Bản nhạc không tồn tại hoặc đã bị xoá.')}
      >
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => trackQuery.refetch()}>
          Thử lại
        </button>
      </StateBlock>
    );
  }

  return (
    <section className="table-shell detail-card" aria-label={`Chi tiết track ${track.title}`}>
      <header className="detail-header">
        <div>
          <h1 className="detail-heading">{track.title}</h1>
          <p className="cell-meta">
            {track.artist} · {durationLabel(track.durationMs)} · {licenseLabel(track.licenseType)}
          </p>
        </div>
        <div className="detail-header-badges">
          <StatusBadge
            tone={track.isActive ? 'success' : 'muted'}
            label={track.isActive ? 'Đang dùng' : 'Đã ngưng'}
          />
        </div>
      </header>

      <div className="detail-card-body page-stack">
        {/* Playback — one player; previewKey aliases audioKey, so a second
            "preview" control would play the identical file. */}
        <section aria-label="Nghe thử">
          <audio
            ref={audioRef}
            preload="none"
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
          />
          <button className="btn btn-secondary btn-sm" type="button" onClick={togglePlay}>
            {isPlaying ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
            {isPlaying ? 'Dừng' : 'Nghe thử'}
          </button>
          {playError && (
            <p className="form-error" role="alert">
              {playError}
            </p>
          )}
        </section>

        {/* Editable metadata */}
        <section aria-labelledby="music-edit-heading">
          <h2 id="music-edit-heading" className="detail-section-title">Thông tin</h2>
          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">Tiêu đề</span>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={saving} />
            </label>
            <label className="form-field">
              <span className="form-label">Nghệ sĩ</span>
              <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={200} disabled={saving} />
            </label>
          </div>
          <label className="form-field">
            <span className="form-label">
              Ghi công {track.licenseType === 'cc-by' ? '(bắt buộc cho CC-BY)' : ''}
            </span>
            <input className="input" value={attribution} onChange={(e) => setAttribution(e.target.value)} maxLength={1000} disabled={saving} />
          </label>
          {saveError && <p className="form-error" role="alert">{saveError}</p>}
          {saved && <p className="cell-meta" role="status">Đã lưu.</p>}
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            title={dirty ? 'Lưu các thay đổi' : 'Chưa có thay đổi'}
          >
            {saving ? <Loader2 size={14} className="state-icon-spin" aria-hidden /> : null}
            {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </section>

        {/* Read-only provenance — license evidence must not be editable. Mirrors
            `AuditLogDetail`: <details class="detail-section"> wraps the summary so
            the shared `.detail-section .description-list` styling applies, and its
            direct children stay dt/dd (wrapping a pair in a <div> breaks the
            list into stacked label/value blocks). */}
        <details className="detail-section">
          <summary className="detail-section-title">Chi tiết kỹ thuật và bản quyền</summary>
          <dl className="description-list">
            <dt className="cell-meta">Giấy phép</dt>
            <dd>{licenseLabel(track.licenseType)}</dd>

            <dt className="cell-meta">Ghi công</dt>
            <dd>{track.attribution?.trim() || <span className="cell-meta">Chưa có</span>}</dd>

            <dt className="cell-meta">Tags</dt>
            <dd>
              {track.tags?.length ? (
                track.tags.join(', ')
              ) : (
                <span className="cell-meta">
                  Chưa gắn tag — không lọc được theo nhóm trong thư viện app
                </span>
              )}
            </dd>

            <dt className="cell-meta">Lượt dùng (tổng)</dt>
            <dd>{formatNumber(track.usageCount ?? 0)}</dd>

            <dt className="cell-meta">Đang dùng ở</dt>
            <dd>
              {track.usage ? (
                <>
                  {formatNumber(track.usage.stories)} khoảnh khắc ·{' '}
                  {formatNumber(track.usage.posts)} bài đăng
                </>
              ) : (
                <span className="cell-meta">—</span>
              )}
            </dd>

            <dt className="cell-meta">Ngày thêm</dt>
            <dd>{formatDateTime(track.addedAt)}</dd>

            <dt className="cell-meta">Người thêm</dt>
            <dd>{track.addedByName ?? <span className="cell-meta">Không xác định</span>}</dd>

            <dt className="cell-meta">URL giấy phép</dt>
            <dd><span className="k-mono">{track.licenseUrl}</span></dd>

            <dt className="cell-meta">URL nguồn</dt>
            <dd><span className="k-mono">{track.sourceUrl}</span></dd>

            <dt className="cell-meta">Khoá lưu trữ</dt>
            <dd><span className="k-mono">{track.audioKey}</span></dd>
          </dl>
        </details>

        {/* Per-track audit */}
        <section aria-labelledby="music-audit-heading">
          <h2 id="music-audit-heading" className="detail-section-title">Lịch sử thao tác</h2>
          {auditQuery.isLoading && <p className="cell-meta">Đang tải lịch sử…</p>}
          {!auditQuery.isLoading && (auditQuery.data?.length ?? 0) === 0 && (
            <p className="cell-meta">Chưa có thao tác nào được ghi cho track này.</p>
          )}
          <ul className="audit-list">
            {(auditQuery.data ?? []).map((e) => (
              <li key={e._id} className="audit-list-row">
                <StatusBadge tone={auditActionTone(e.action)} label={auditActionLabel(e.action)} />
                <span className="cell-meta">{e.actorName ?? 'Không xác định'}</span>
                <span className="cell-meta k-mono">{formatDateTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>

        {(lifecycleError || confirmAction) && (
          <div role="alert" className="lifecycle-confirm">
            {confirmAction && (
              <p className="cell-meta">
                {confirmAction === 'deactivate'
                  ? `Ngưng track: biến mất khỏi thư viện người dùng, file vẫn giữ trong kho.${
                      track.usage && track.usage.total > 0
                        ? ` Hiện có ${formatNumber(track.usage.total)} nội dung đang dùng track này — chúng vẫn phát được.`
                        : ''
                    }`
                  : 'Khôi phục track: hiện lại trong thư viện cho story/post mới.'}
              </p>
            )}
            {lifecycleError && <p className="form-error">{lifecycleError}</p>}
            <div className="lifecycle-confirm-actions">
              {confirmAction ? (
                <>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => setConfirmAction(null)} disabled={busyLifecycle}>
                    Huỷ
                  </button>
                  <button
                    className={`btn btn-sm ${confirmAction === 'deactivate' ? 'btn-danger' : 'btn-primary'}`}
                    type="button"
                    onClick={runLifecycle}
                    disabled={busyLifecycle}
                  >
                    {busyLifecycle ? 'Đang xử lý…' : confirmAction === 'deactivate' ? 'Xác nhận ngưng' : 'Xác nhận khôi phục'}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div className="detail-bottombar">
        <span className="cell-meta">
          <AlertTriangle size={13} aria-hidden /> Track đã ngưng vẫn phát được ở nội dung đã đăng.
        </span>
        <span className="detail-bottombar-spacer" />
        {track.isActive ? (
          <button className="btn btn-danger btn-sm" type="button" onClick={() => setConfirmAction('deactivate')}>
            Ngưng track
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" type="button" onClick={() => setConfirmAction('restore')}>
            Khôi phục
          </button>
        )}
      </div>
    </section>
  );
}
