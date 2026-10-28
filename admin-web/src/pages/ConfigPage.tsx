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

/** Một dòng phân bố phiên bản client do server tổng hợp từ telemetry. */
interface ClientVersionRow {
  platform: 'ios' | 'android' | 'web';
  version: string;
  users: number;
  recentlyActive: number;
}
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

/**
 * So sánh phiên bản dạng số: `2.0.10 > 2.0.9`. So chuỗi thì "2.0.10" < "2.0.9" —
 * đúng kiểu lỗi làm admin chọn nhầm mốc.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
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

  /**
   * Phiên bản client đang chạy thật (client tự khai qua header). Đây là nguồn
   * duy nhất để chọn mốc ép cập nhật — repo chưa có app trên App Store/Play nên
   * không có gì để fetch từ store.
   */
  const versions = useQuery({
    queryKey: ['admin-client-versions'],
    queryFn: async () =>
      (
        await apiClient.get<{
          data: ClientVersionRow[];
          reporters: number;
          unknown: number;
        }>('/admin/client-versions')
      ).data,
    staleTime: 60_000,
  });

  /** Phiên bản đang có người dùng, theo từng nền tảng — mới nhất lên đầu. */
  const versionsByPlatform = useMemo(() => {
    const out: Record<'android' | 'ios', ClientVersionRow[]> = {
      android: [],
      ios: [],
    };
    for (const row of versions.data?.data ?? []) {
      if (row.platform === 'android' || row.platform === 'ios') {
        out[row.platform].push(row);
      }
    }
    for (const key of ['android', 'ios'] as const) {
      out[key].sort((a, b) => compareVersions(b.version, a.version));
    }
    return out;
  }, [versions.data]);

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

    // Bật thông báo mà không có tiêu đề/nội dung thì client hiện banner rỗng —
    // server không chặn nên phải chặn ở đây.
    if (form.announcementActive) {
      if (!form.announcementTitle.trim()) {
        next.announcement = 'Bật thông báo thì phải có tiêu đề.';
      } else if (!form.announcementBody.trim()) {
        next.announcement = 'Bật thông báo thì phải có nội dung.';
      }
    }

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
                {/* Gợi ý lấy từ phiên bản client **đang chạy thật**, không phải
                    gõ tay: gõ sai một chữ số là chặn nhầm cả nhóm người dùng
                    hoặc không chặn được ai. Vẫn cho nhập tay vì mốc mới (chưa ai
                    cài) là ca hợp lệ. */}
                <input
                  id={`cfg-${p.key}-version`}
                  className="input"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  list={`cfg-${p.key}-version-options`}
                  placeholder={versionsByPlatform[p.key][0]?.version ?? '2.1.0'}
                  value={p.version}
                  aria-invalid={Boolean(errors[`${p.key}Version`])}
                  aria-describedby={`cfg-${p.key}-version-help`}
                  onChange={(e) => patchForm({ [`${p.key}Version`]: e.target.value.replace(/[^0-9.]/g, '') })}
                />
                <datalist id={`cfg-${p.key}-version-options`}>
                  {versionsByPlatform[p.key].map((v) => (
                    <option key={v.version} value={v.version}>
                      {v.users} người đang dùng
                    </option>
                  ))}
                </datalist>

                {/* Trạng thái so với dữ liệu thật — trả lời "mốc này chặn ai". */}
                {(() => {
                  const rows = versionsByPlatform[p.key];
                  if (versions.isLoading) {
                    return <span className="form-hint" id={`cfg-${p.key}-version-help`}>Đang đọc phiên bản client…</span>;
                  }
                  if (versions.isError) {
                    return (
                      <span className="form-hint" id={`cfg-${p.key}-version-help`}>
                        Không đọc được phiên bản client — nhập tay được nhưng không kiểm được ai bị chặn.
                      </span>
                    );
                  }
                  if (rows.length === 0) {
                    return (
                      <span className="form-hint" id={`cfg-${p.key}-version-help`}>
                        Chưa có client {p.label} nào khai phiên bản — chưa kiểm được mốc này.
                      </span>
                    );
                  }
                  const entered = p.version.trim();
                  if (!entered) {
                    const newest = rows[0];
                    return (
                      <span className="form-hint" id={`cfg-${p.key}-version-help`}>
                        Bản mới nhất đang chạy: <strong>{newest.version}</strong> ({newest.users} người).
                        Nhập mốc để bật ép cập nhật.
                      </span>
                    );
                  }
                  // Mốc = minVersion: ai có version NHỎ HƠN mốc sẽ bị chặn.
                  const blocked = rows.filter((r) => compareVersions(r.version, entered) < 0);
                  const blockedUsers = blocked.reduce((sum, r) => sum + r.users, 0);
                  const unknownVersion = !VERSION.test(entered);

                  if (unknownVersion) {
                    return (
                      <span className="form-hint" id={`cfg-${p.key}-version-help`}>
                        Phiên bản dạng 1 hoặc 1.2.3.
                      </span>
                    );
                  }
                  if (blockedUsers === 0) {
                    return (
                      <span className="form-hint" id={`cfg-${p.key}-version-help`}>
                        Không ai bị chặn: mọi client {p.label} đang chạy đều ≥ {entered}.
                      </span>
                    );
                  }
                  return (
                    <span className="form-hint cfg-version-impact" id={`cfg-${p.key}-version-help`}>
                      Chặn <strong>{blockedUsers} người</strong> đang chạy{' '}
                      {blocked.map((b) => b.version).join(', ')} — họ phải cập nhật mới dùng tiếp được.
                    </span>
                  );
                })()}

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
            <label className="form-label" htmlFor="cfg-announce-title">
              Tiêu đề {form.announcementActive && <span className="form-required">*</span>}
            </label>
            <input
              id="cfg-announce-title"
              className="input"
              type="text"
              maxLength={MAX_TITLE}
              aria-required={form.announcementActive || undefined}
              aria-invalid={Boolean(errors.announcement) || undefined}
              value={form.announcementTitle}
              onChange={(e) => patchForm({ announcementTitle: e.target.value })}
            />
            <span className="form-hint">{form.announcementTitle.length}/{MAX_TITLE} ký tự</span>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="cfg-announce-body">
              Nội dung {form.announcementActive && <span className="form-required">*</span>}
            </label>
            <textarea
              id="cfg-announce-body"
              className="textarea"
              maxLength={MAX_BODY}
              rows={4}
              aria-required={form.announcementActive || undefined}
              aria-invalid={Boolean(errors.announcement) || undefined}
              value={form.announcementBody}
              onChange={(e) => patchForm({ announcementBody: e.target.value })}
            />
            <span className="form-hint">{form.announcementBody.length}/{MAX_BODY} ký tự</span>
          </div>
          {errors.announcement && <span className="form-error" role="alert">{errors.announcement}</span>}
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
