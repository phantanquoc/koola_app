import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import apiClient from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import StateBlock from '../components/StateBlock';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { apiErrorMessage } from '../components/formatters';
import { useAdminRole } from '../useAuth';
import './admin-new-pages.css';

/**
 * Cấu hình động toàn hệ thống.
 *
 * Hai điểm không hiển nhiên đã kiểm với backend (src/config):
 * - PATCH là merge: gửi `featureFlags` chỉ cộng/ghi đè, KHÔNG xoá cờ. Sau khi
 *   lưu, form đối chiếu lại response và báo rõ nếu cờ vừa xoá vẫn còn trên server
 *   — xem crossFileNeeds (backend cần cờ "replace").
 * - `minVersion` rỗng bị @Matches từ chối; muốn tắt ép cập nhật phải nhập
 *   "0.0.0" (mọi bản đều ≥ 0.0.0). UI chặn xoá trắng để không gửi payload 400.
 */

interface ForcePlatform {
  minVersion: string;
  message: string;
}

interface PublicConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  forceUpdate: { android: ForcePlatform; ios: ForcePlatform };
  featureFlags: Record<string, boolean>;
  announcement: { title: string; body: string; active: boolean; at: string | null };
}

interface FlagRow {
  rowId: number;
  key: string;
  value: boolean;
}

interface ConfigForm {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  androidVersion: string;
  androidMessage: string;
  iosVersion: string;
  iosMessage: string;
  flags: FlagRow[];
  announcementTitle: string;
  announcementBody: string;
  announcementActive: boolean;
}

const VERSION = /^\d{1,4}(\.\d{1,4}){0,3}$/;
const FLAG_KEY = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_FLAGS = 200;
const MAX_MESSAGE = 500;
const MAX_TITLE = 200;
const MAX_BODY = 2000;

function toForm(cfg: PublicConfig, nextRowId: () => number): ConfigForm {
  return {
    maintenanceMode: cfg.maintenanceMode,
    maintenanceMessage: cfg.maintenanceMessage,
    androidVersion: cfg.forceUpdate.android.minVersion,
    androidMessage: cfg.forceUpdate.android.message,
    iosVersion: cfg.forceUpdate.ios.minVersion,
    iosMessage: cfg.forceUpdate.ios.message,
    flags: Object.entries(cfg.featureFlags).map(([key, value]) => ({ rowId: nextRowId(), key, value })),
    announcementTitle: cfg.announcement.title,
    announcementBody: cfg.announcement.body,
    announcementActive: cfg.announcement.active,
  };
}

/** Payload gửi lên + dùng để so sánh "đã đổi gì" trước khi mở confirm. */
function buildPayload(form: ConfigForm) {
  const platform = (version: string, message: string) => ({
    // Version rỗng: bỏ hẳn field để server giữ nguyên giá trị cũ.
    ...(version.trim() ? { minVersion: version.trim() } : {}),
    message,
  });
  const flags: Record<string, boolean> = {};
  for (const row of form.flags) {
    if (row.key.trim()) flags[row.key.trim()] = row.value;
  }
  return {
    maintenanceMode: form.maintenanceMode,
    maintenanceMessage: form.maintenanceMessage,
    forceUpdate: {
      android: platform(form.androidVersion, form.androidMessage),
      ios: platform(form.iosVersion, form.iosMessage),
    },
    featureFlags: flags,
    announcement: {
      title: form.announcementTitle,
      body: form.announcementBody,
      active: form.announcementActive,
    },
  };
}

function toCmp(form: ConfigForm) {
  return JSON.stringify(buildPayload(form));
}

/** Tóm tắt thay đổi cho confirm — chỉ nhóm thực sự đổi, không dội cả form. */
function changeSummary(next: ConfigForm, prev: ConfigForm): string[] {
  const out: string[] = [];
  if (next.maintenanceMode !== prev.maintenanceMode) {
    out.push(next.maintenanceMode ? 'Bật chế độ bảo trì' : 'Tắt chế độ bảo trì');
  }
  if (next.maintenanceMessage !== prev.maintenanceMessage) out.push('Sửa thông điệp bảo trì');
  if (next.androidVersion !== prev.androidVersion) out.push(`Phiên bản Android: ${next.androidVersion || '0.0.0'}`);
  if (next.iosVersion !== prev.iosVersion) out.push(`Phiên bản iOS: ${next.iosVersion || '0.0.0'}`);
  if (next.androidMessage !== prev.androidMessage) out.push('Sửa thông điệp ép cập nhật Android');
  if (next.iosMessage !== prev.iosMessage) out.push('Sửa thông điệp ép cập nhật iOS');

  const prevFlags = new Map(prev.flags.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value]));
  const nextFlags = new Map(next.flags.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value]));
  for (const [key, value] of nextFlags) {
    if (!prevFlags.has(key)) out.push(`Thêm cờ ${key} = ${value ? 'bật' : 'tắt'}`);
    else if (prevFlags.get(key) !== value) out.push(`Cờ ${key} → ${value ? 'bật' : 'tắt'}`);
  }
  for (const key of prevFlags.keys()) {
    if (!nextFlags.has(key)) out.push(`Xoá cờ ${key}`);
  }

  if (next.announcementTitle !== prev.announcementTitle) out.push('Sửa tiêu đề thông báo');
  if (next.announcementBody !== prev.announcementBody) out.push('Sửa nội dung thông báo');
  if (next.announcementActive !== prev.announcementActive) {
    out.push(next.announcementActive ? 'Bật thông báo hệ thống' : 'Tắt thông báo hệ thống');
  }
  return out;
}

export default function ConfigPage() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  // PATCH /admin/config chỉ super được gọi — ẩn nút Lưu thay vì để ăn 403.
  const canEdit = useAdminRole() === 'super';
  const rowIdRef = useRef(0);
  const nextRowId = () => {
    rowIdRef.current += 1;
    return rowIdRef.current;
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-config'],
    queryFn: async () => (await apiClient.get<PublicConfig>('/admin/config')).data,
  });

  // Khởi tạo một lần khi có dữ liệu; refetch nền không được ghi đè thứ đang sửa.
  const [server, setServer] = useState<ConfigForm | null>(null);
  const [form, setForm] = useState<ConfigForm | null>(null);
  useEffect(() => {
    if (!data || server) return;
    const base = toForm(data, nextRowId);
    setServer(base);
    setForm(base);
  }, [data, server]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const payload = useMemo(() => (form ? buildPayload(form) : null), [form]);
  const dirty = Boolean(form && server && toCmp(form) !== toCmp(server));

  function patchForm(patch: Partial<ConfigForm>) {
    setForm((f) => (f ? { ...f, ...patch } : f));
  }

  function patchFlag(rowId: number, patch: Partial<FlagRow>) {
    setForm((f) => (f ? { ...f, flags: f.flags.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)) } : f));
  }

  function addFlag() {
    setForm((f) => (f ? { ...f, flags: [...f.flags, { rowId: nextRowId(), key: '', value: true }] } : f));
  }

  function removeFlag(rowId: number) {
    setForm((f) => (f ? { ...f, flags: f.flags.filter((r) => r.rowId !== rowId) } : f));
  }

  /** Lỗi form kiểm ở client để không bắn payload chắc chắn 400 rồi mới báo. */
  function validate(): boolean {
    if (!form || !server) return false;
    const next: Record<string, string> = {};

    if (form.androidVersion.trim() && !VERSION.test(form.androidVersion.trim())) {
      next.androidVersion = 'Phiên bản dạng 1 hoặc 1.2.3.';
    }
    if (form.iosVersion.trim() && !VERSION.test(form.iosVersion.trim())) {
      next.iosVersion = 'Phiên bản dạng 1 hoặc 1.2.3.';
    }
    // Server không nhận chuỗi rỗng cho minVersion — xoá trắng nghĩa là giữ
    // nguyên giá trị cũ, không phải tắt. Muốn tắt thì nhập 0.0.0.
    if (!form.androidVersion.trim() && server.androidVersion) {
      next.androidVersion = 'Không xoá trắng được — nhập 0.0.0 để tắt ép cập nhật.';
    }
    if (!form.iosVersion.trim() && server.iosVersion) {
      next.iosVersion = 'Không xoá trắng được — nhập 0.0.0 để tắt ép cập nhật.';
    }

    const keys = form.flags.filter((r) => r.key.trim()).map((r) => r.key.trim());
    const badKey = keys.find((k) => !FLAG_KEY.test(k));
    if (form.flags.some((r) => !r.key.trim())) {
      // Dòng trống bị buildPayload bỏ qua — không báo thì người dùng thấy nó
      // "tự biến mất" sau khi lưu.
      next.flags = 'Có dòng cờ chưa nhập tên — nhập tên hoặc xoá dòng.';
    } else if (badKey) next.flags = `Tên cờ "${badKey}" chỉ được chứa chữ, số, gạch ngang/gạch dưới.`;
    else if (new Set(keys).size !== keys.length) next.flags = 'Tên cờ bị trùng — mỗi cờ một dòng.';
    else if (keys.length > MAX_FLAGS) next.flags = `Tối đa ${MAX_FLAGS} cờ.`;

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function openConfirm() {
    if (!dirty || busy) return;
    if (!validate()) return;
    setConfirmOpen(true);
  }

  async function save() {
    if (!payload || busy || !server) return;
    // `announcement.at` là mốc client dùng để hiện lại thông báo. Backend đặt lại
    // mốc mỗi khi field này có trong PATCH — gửi kèm khi không sửa gì sẽ khiến
    // toàn bộ người dùng thấy lại thông báo cũ. Bỏ hẳn nhóm nếu không đổi.
    const announcementChanged =
      form?.announcementTitle !== server.announcementTitle
      || form?.announcementBody !== server.announcementBody
      || form?.announcementActive !== server.announcementActive;
    const body = { ...payload };
    if (!announcementChanged) delete (body as { announcement?: unknown }).announcement;

    setBusy(true);
    const removedKeys = server.flags
      .map((r) => r.key.trim())
      .filter((k) => k && !(k in payload.featureFlags));
    try {
      const res = await apiClient.patch<PublicConfig>('/admin/config', body);
      const saved = res.data;
      const base = toForm(saved, nextRowId);
      setServer(base);
      setForm(base);
      setConfirmOpen(false);
      addToast('success', 'Đã lưu cấu hình hệ thống.');
      // PATCH merge cờ: cờ vừa xoá vẫn còn trên server. Nói thẳng thay vì
      // để form "tự mọc lại" một cách khó hiểu.
      const stillThere = removedKeys.filter((k) => k in saved.featureFlags);
      if (stillThere.length > 0) {
        addToast('warning', `Máy chủ chưa xoá cờ ${stillThere.join(', ')} — hiện chỉ hỗ trợ thêm/sửa cờ.`);
      }
      void queryClient.invalidateQueries({ queryKey: ['admin-config'] });
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Lưu cấu hình thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  if (isError) {
    return (
      <div className="page-stack">
        <PageHeader title="Cấu hình hệ thống" description="Bảo trì, ép cập nhật, cờ tính năng và thông báo toàn hệ thống." />
        <StateBlock variant="error" title="Không tải được cấu hình" copy={apiErrorMessage(error, 'Kiểm tra kết nối rồi thử lại.')}>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => refetch()}>Thử lại</button>
        </StateBlock>
      </div>
    );
  }

  if (isLoading || !form || !server) {
    return (
      <div className="page-stack">
        <PageHeader title="Cấu hình hệ thống" description="Bảo trì, ép cập nhật, cờ tính năng và thông báo toàn hệ thống." />
        <StateBlock variant="loading" title="Đang tải cấu hình" copy="Đang lấy cấu hình hiện tại của hệ thống." />
      </div>
    );
  }

  const changes = changeSummary(form, server);

  return (
    <div className="page-stack">
      <PageHeader
        title="Cấu hình hệ thống"
        description="Thay đổi ở đây áp dụng cho mọi client ngay sau khi lưu."
        actions={<button className="btn btn-primary" type="button" disabled={!canEdit || !dirty || busy} onClick={openConfirm}>Lưu thay đổi</button>}
      />

      {!canEdit && (
        <div className="alert alert--warning" role="status">
          <div>
            <strong>Chế độ chỉ đọc</strong>
            Chỉ quản trị cấp cao được sửa cấu hình hệ thống.
          </div>
        </div>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Bảo trì</div>
            <p className="panel-subtitle">Bật bảo trì sẽ chặn thao tác trên toàn hệ thống.</p>
          </div>
        </div>
        <div className="panel-body cfg-group">
          <label className="cfg-toggle">
            <input
              type="checkbox"
              checked={form.maintenanceMode}
              onChange={(e) => patchForm({ maintenanceMode: e.target.checked })}
            />
            Đang bảo trì
          </label>
          <div className="form-field">
            <label className="form-label" htmlFor="cfg-maintenance-message">Thông điệp hiển thị cho người dùng</label>
            <textarea
              id="cfg-maintenance-message"
              className="textarea"
              value={form.maintenanceMessage}
              maxLength={MAX_MESSAGE}
              rows={3}
              placeholder="Ví dụ: Hệ thống bảo trì tới 03:00 ngày 27/10. Xin lỗi vì bất tiện."
              onChange={(e) => patchForm({ maintenanceMessage: e.target.value })}
            />
            <span className="form-hint">{form.maintenanceMessage.length}/{MAX_MESSAGE} ký tự</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Ép cập nhật</div>
            <p className="panel-subtitle">Client cũ hơn phiên bản tối thiểu phải cập nhật mới dùng tiếp được. Để trống nếu chưa ép.</p>
          </div>
        </div>
        <div className="panel-body cfg-platform">
          {([
            { key: 'android', label: 'Android', version: form.androidVersion, message: form.androidMessage },
            { key: 'ios', label: 'iOS', version: form.iosVersion, message: form.iosMessage },
          ] as const).map((p) => (
            <div className="form-grid" key={p.key}>
              <div className="form-field">
                <label className="form-label" htmlFor={`cfg-${p.key}-version`}>Phiên bản tối thiểu · {p.label}</label>
                {/* Không dùng IntegerInput: phiên bản có dấu chấm (1.2.3) và
                    inputMode="decimal" mở đúng bàn phím số mà vẫn giữ dấu. */}
                <input
                  id={`cfg-${p.key}-version`}
                  className="input"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="2.1.0"
                  value={p.version}
                  aria-invalid={Boolean(errors[`${p.key}Version`])}
                  aria-describedby={errors[`${p.key}Version`] ? `cfg-${p.key}-version-error` : undefined}
                  onChange={(e) => patchForm({ [`${p.key}Version`]: e.target.value.replace(/[^0-9.]/g, '') })}
                />
                {errors[`${p.key}Version`] && (
                  <span className="form-error" id={`cfg-${p.key}-version-error`}>{errors[`${p.key}Version`]}</span>
                )}
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor={`cfg-${p.key}-message`}>Thông điệp · {p.label}</label>
                <input
                  id={`cfg-${p.key}-message`}
                  className="input"
                  type="text"
                  maxLength={MAX_MESSAGE}
                  placeholder="Bản cập nhật bắt buộc để tiếp tục sử dụng"
                  value={p.message}
                  onChange={(e) => patchForm({ [`${p.key}Message`]: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Cờ tính năng</div>
            <p className="panel-subtitle">Bật/tắt tính năng theo tên cờ. Tên chỉ gồm chữ, số, gạch ngang và gạch dưới.</p>
          </div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={addFlag}>
            <Plus size={14} aria-hidden /> Thêm cờ
          </button>
        </div>
        <div className="panel-body cfg-flags">
          {form.flags.length === 0 && <p className="cell-meta">Chưa có cờ nào. Thêm cờ để bật/tắt tính năng theo đợt phát hành.</p>}
          {form.flags.map((row) => (
            <div className="cfg-flag-row" key={row.rowId}>
              <input
                className="input k-mono"
                type="text"
                inputMode="text"
                autoComplete="off"
                maxLength={64}
                placeholder="ten_co"
                aria-label="Tên cờ"
                value={row.key}
                onChange={(e) => patchFlag(row.rowId, { key: e.target.value })}
              />
              <label className="cfg-flag-value">
                <input
                  type="checkbox"
                  checked={row.value}
                  aria-label={`Bật cờ ${row.key || 'chưa đặt tên'}`}
                  onChange={(e) => patchFlag(row.rowId, { value: e.target.checked })}
                />
                {row.value ? 'Bật' : 'Tắt'}
              </label>
              <button
                className="btn btn-danger-ghost btn-icon"
                type="button"
                onClick={() => removeFlag(row.rowId)}
                aria-label={`Xoá cờ ${row.key || 'chưa đặt tên'}`}
                title="Xoá cờ"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          ))}
          {errors.flags && <span className="form-error">{errors.flags}</span>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">Thông báo hệ thống</div>
            <p className="panel-subtitle">Bật để client hiện thông báo một lần cho mỗi bản thông báo mới.</p>
          </div>
        </div>
        <div className="panel-body cfg-group">
          <label className="cfg-toggle">
            <input
              type="checkbox"
              checked={form.announcementActive}
              onChange={(e) => patchForm({ announcementActive: e.target.checked })}
            />
            Đang bật thông báo
          </label>
          <div className="form-field">
            <label className="form-label" htmlFor="cfg-announce-title">Tiêu đề</label>
            <input
              id="cfg-announce-title"
              className="input"
              type="text"
              maxLength={MAX_TITLE}
              value={form.announcementTitle}
              onChange={(e) => patchForm({ announcementTitle: e.target.value })}
            />
            <span className="form-hint">{form.announcementTitle.length}/{MAX_TITLE} ký tự</span>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="cfg-announce-body">Nội dung</label>
            <textarea
              id="cfg-announce-body"
              className="textarea"
              maxLength={MAX_BODY}
              rows={4}
              value={form.announcementBody}
              onChange={(e) => patchForm({ announcementBody: e.target.value })}
            />
            <span className="form-hint">{form.announcementBody.length}/{MAX_BODY} ký tự</span>
          </div>
        </div>
      </section>

      <div className="cfg-save-bar">
        <span className="cfg-save-note">
          {dirty ? `${changes.length} thay đổi chưa lưu.` : 'Chưa có thay đổi nào.'}
        </span>
        <button className="btn btn-primary" type="button" disabled={!dirty || busy} onClick={openConfirm}>
          Lưu thay đổi
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Áp dụng cấu hình cho toàn hệ thống?"
        description="Thay đổi có hiệu lực với mọi client ngay khi lưu. Kiểm tra lại từng mục — bật bảo trì hoặc ép cập nhật sai sẽ chặn người dùng."
        confirmLabel="Lưu cấu hình"
        variant="primary"
        // Diện rộng (mọi client) → type-to-confirm theo DESIGN §0.5; bật bảo trì
        // sai có thể khoá toàn bộ người dùng ra ngoài.
        requireText="XACNHAN"
        busy={busy}
        onConfirm={save}
        preview={(
          <ul className="confirm-list">
            {changes.map((c) => <li key={c}>{c}</li>)}
          </ul>
        )}
      />
    </div>
  );
}
