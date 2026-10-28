import { useEffect, useState, useSyncExternalStore } from 'react';
import { Clock, LogOut, ShieldAlert } from 'lucide-react';
import { tokenStorage } from '../tokenStorage';
import './impersonation.css';

/**
 * Xem-thay người dùng (mục #25).
 *
 * Hợp đồng: POST /admin/users/:id/impersonate trả token chỉ-đọc 5 phút. Token
 * đó thay token admin trong `tokenStorage` vì interceptor của apiClient luôn
 * đọc token từ đây — gắn header riêng ở một request là không đủ.
 *
 * An toàn: token admin được cất tạm vào sessionStorage (chỉ để khôi phục khi
 * thoát), không log, và bị xoá ngay khi hết hạn. Nếu trình duyệt chặn
 * sessionStorage thì từ chối bắt đầu — thà không xem được còn hơn kẹt ở token
 * người dùng mà mất token admin.
 */

const BACKUP_KEY = 'admin.impersonation.backup';
const STATE_KEY = 'admin.impersonation.state';
const MAX_TTL_SECONDS = 5 * 60;

export interface ImpersonationTarget {
  id: string;
  displayName: string;
}

export interface ImpersonationState {
  target: ImpersonationTarget;
  /** Epoch ms — bar tự thoát khi qua mốc này. */
  expiresAt: number;
}

interface ImpersonationGrant {
  accessToken: string;
  expiresAt?: string | number;
  expiresIn?: number;
  targetUser?: ImpersonationTarget;
  target?: ImpersonationTarget;
}

/** Chỉ cần đúng phần apiClient dùng tới — không kéo type axios vào component. */
export interface ImpersonationApiClient {
  post(url: string): Promise<{ data: ImpersonationGrant }>;
}

let snapshot: ImpersonationState | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function safeGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Không còn gì để khôi phục — không có cách xử lý thêm.
  }
}

/** Tab mở lại giữa phiên: hiện lại bar, hoặc khôi phục admin nếu đã hết hạn. */
function readPersisted(): ImpersonationState | null {
  const backup = safeGet(BACKUP_KEY);
  const raw = safeGet(STATE_KEY);
  if (!backup || !raw) {
    if (backup || raw) {
      safeRemove(BACKUP_KEY);
      safeRemove(STATE_KEY);
    }
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ImpersonationState;
    if (parsed?.target && typeof parsed.expiresAt === 'number' && parsed.expiresAt > Date.now()) {
      return parsed;
    }
  } catch {
    // JSON hỏng → coi như phiên đã hết hạn.
  }
  tokenStorage.setAccess(backup);
  safeRemove(BACKUP_KEY);
  safeRemove(STATE_KEY);
  return null;
}

snapshot = readPersisted();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ImpersonationState | null {
  return snapshot;
}

/**
 * Đang ở chế độ xem-thay? apiClient phải bỏ qua silent-refresh khi true: refresh
 * token vẫn là của admin, refresh xong sẽ lặng lẽ trả lại quyền ghi trong khi
 * bar vẫn ghi "chỉ đọc".
 */
export function isImpersonating(): boolean {
  return snapshot !== null;
}

function resolveExpiry(grant: ImpersonationGrant): number {
  const fromField =
    typeof grant.expiresAt === 'number'
      ? grant.expiresAt
      : grant.expiresAt
        ? new Date(grant.expiresAt).getTime()
        : Number.NaN;
  if (Number.isFinite(fromField)) return fromField;
  // Backend hiện trả `expiresIn` (giây) chứ chưa có `expiresAt`.
  const seconds =
    Number.isFinite(grant.expiresIn) && (grant.expiresIn ?? 0) > 0
      ? Math.min(grant.expiresIn as number, MAX_TTL_SECONDS)
      : MAX_TTL_SECONDS;
  return Date.now() + seconds * 1000;
}

/**
 * Bắt đầu xem thay. Gọi từ trang chi tiết người dùng (không phải bar) — store
 * module-level để bar đang mount nhận được thay đổi.
 */
export async function startImpersonation(
  userId: string,
  apiClient: ImpersonationApiClient,
): Promise<ImpersonationState> {
  if (snapshot) {
    throw new Error('Đang ở chế độ xem thay — thoát phiên hiện tại trước.');
  }
  const res = await apiClient.post(`/admin/users/${encodeURIComponent(userId)}/impersonate`);
  const grant = res.data;
  if (!grant?.accessToken) {
    throw new Error('Máy chủ không trả token xem thay.');
  }

  // Chưa có phiên xem-thay (chặn ở trên) nên token hiện tại chính là của admin.
  const adminToken = tokenStorage.getAccess();
  if (!adminToken) {
    throw new Error('Không tìm thấy token quản trị để khôi phục sau khi thoát.');
  }

  const next: ImpersonationState = {
    target: grant.targetUser ?? grant.target ?? { id: userId, displayName: 'người dùng' },
    expiresAt: resolveExpiry(grant),
  };

  // Ghi đủ cặp khoá trước khi đổi token: một nửa ghi được = không có đường về.
  if (!safeSet(BACKUP_KEY, adminToken) || !safeSet(STATE_KEY, JSON.stringify(next))) {
    safeRemove(BACKUP_KEY);
    safeRemove(STATE_KEY);
    throw new Error('Trình duyệt không cho lưu phiên xem thay — không thể bắt đầu an toàn.');
  }

  tokenStorage.setAccess(grant.accessToken);
  snapshot = next;
  notify();
  return next;
}

/** Thoát xem thay — khôi phục token admin đã cất tạm. Idempotent. */
export function stopImpersonation(): void {
  const backup = safeGet(BACKUP_KEY);
  if (backup) tokenStorage.setAccess(backup);
  safeRemove(BACKUP_KEY);
  safeRemove(STATE_KEY);
  if (!snapshot) return;
  snapshot = null;
  notify();
}

function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Thanh cố định trên cùng khi đang xem thay. Tự render null khi không có phiên;
 * AppLayout chỉ cần đặt `<ImpersonationBar />` một lần.
 */
export function ImpersonationBar() {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  // tick = null ở lần render đầu của mỗi phiên → dùng Date.now() tươi, không
  // hiện sai "12:00" khi bar mount từ trước lúc bắt đầu.
  const [tick, setTick] = useState<number | null>(null);

  useEffect(() => {
    if (!state) {
      setTick(null);
      return;
    }
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state]);

  const now = tick ?? Date.now();
  const remainingMs = state ? Math.max(0, state.expiresAt - now) : 0;

  // Hết hạn = hết token chỉ-đọc; trả token admin ngay thay vì để request sau 401.
  useEffect(() => {
    if (state && remainingMs === 0) stopImpersonation();
  }, [state, remainingMs]);

  if (!state) return null;

  return (
    <div className="impersonation-bar" role="region" aria-label="Chế độ xem thay người dùng">
      <span className="impersonation-bar__icon" aria-hidden="true">
        <ShieldAlert size={18} strokeWidth={2} />
      </span>
      <span className="impersonation-bar__who">
        Đang xem như <strong>{state.target.displayName}</strong>
      </span>
      <span className="impersonation-bar__warn">Chỉ đọc — mọi thao tác ghi đều bị chặn</span>
      <span className="impersonation-bar__clock" aria-live="off" title="Thời gian còn lại">
        <Clock size={14} strokeWidth={2} aria-hidden /> Còn {formatCountdown(remainingMs)}
      </span>
      <button type="button" className="impersonation-bar__exit" onClick={stopImpersonation}>
        <LogOut size={14} strokeWidth={2} aria-hidden /> Thoát
      </button>
    </div>
  );
}

export default ImpersonationBar;
