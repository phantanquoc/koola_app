import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import apiClient from '../apiClient';
import { ConfirmDialog } from './ConfirmDialog';
import { apiErrorMessage } from './formatters';
import { StatusBadge } from './StatusBadge';
import { useToast } from './Toast';
import { useRefreshIdentity } from '../useAuth';
import './user-admin.css';

interface MeAccount {
  _id?: string;
  id?: string;
  twoFactorEnabled?: boolean;
}

interface SetupResult {
  secret: string;
  otpauthUrl: string;
}

type Step = 'idle' | 'setup' | 'recovery' | 'disable';

/**
 * Bật/tắt 2FA cho tài khoản admin đang đăng nhập.
 *
 * Endpoint /auth/2fa/* thao tác trên chính người gọi token, nên panel chỉ được
 * hiện khi mở đúng hồ sơ của mình — không có đường admin bật 2FA hộ người khác.
 */
export function TwoFactorPanel({ userId }: { userId: string }) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  // Wall 2FA đọc `identity.twoFactorEnabled`; bật xong phải làm mới identity thì
  // wall mới tự mở, nếu không admin phải F5 — đúng kiểu nút giả.
  const refreshIdentity = useRefreshIdentity();
  const [step, setStep] = useState<Step>('idle');
  const [setup, setSetup] = useState<SetupResult | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const me = useQuery({
    queryKey: ['admin-me'],
    queryFn: async () => (await apiClient.get<MeAccount>('/admin/me')).data,
    staleTime: 30_000,
  });

  const meId = me.data?._id ?? me.data?.id;
  // Chưa biết /me hoặc xem hồ sơ người khác → không hiện khối này.
  if (!meId || meId !== userId) return null;

  const enabled = Boolean(me.data?.twoFactorEnabled);

  function reset() {
    setStep('idle');
    setSetup(null);
    setRecoveryCodes([]);
    setCode('');
  }

  async function startSetup() {
    setBusy(true);
    try {
      const res = await apiClient.post<SetupResult>('/auth/2fa/setup');
      setSetup(res.data);
      setStep('setup');
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Không tạo được mã 2FA. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    if (busy) return;
    if (!/^\d{6}$/.test(code.trim())) {
      addToast('warning', 'Nhập đúng 6 chữ số từ ứng dụng xác thực.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiClient.post<{ recoveryCodes: string[] }>('/auth/2fa/enable', {
        code: code.trim(),
      });
      setRecoveryCodes(res.data.recoveryCodes);
      setSetup(null);
      setCode('');
      setStep('recovery');
      addToast('success', 'Đã bật 2FA. Lưu ngay mã khôi phục.');
      void queryClient.invalidateQueries({ queryKey: ['admin-me'] });
      // Wall 2FA đọc từ AuthContext — không làm mới thì đứng nguyên sau khi bật.
      void refreshIdentity();
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Mã xác thực không đúng.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable() {
    if (busy) return;
    setBusy(true);
    try {
      await apiClient.post('/auth/2fa/disable', { code: code.trim() });
      addToast('success', 'Đã tắt 2FA.');
      reset();
      void queryClient.invalidateQueries({ queryKey: ['admin-me'] });
      void refreshIdentity();
    } catch (err) {
      addToast('error', apiErrorMessage(err, 'Mã xác thực không đúng.'));
    } finally {
      setBusy(false);
    }
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setCopied(true);
      addToast('success', 'Đã chép mã khôi phục.');
    } catch {
      addToast('error', 'Trình duyệt chặn chép tự động — hãy chọn và chép tay.');
    }
  }

  return (
    <section className="detail-section" aria-label="Xác thực hai lớp">
      <h3 className="detail-section-title">Xác thực hai lớp (2FA)</h3>

      {step === 'idle' && (
        <>
          <p className="mfa-status">
            <StatusBadge
              tone={enabled ? 'success' : 'muted'}
              label={enabled ? 'Đang bật' : 'Đang tắt'}
            />
            <span className="cell-meta">
              {enabled
                ? 'Đăng nhập cần mã 6 số từ ứng dụng xác thực.'
                : 'Bảo vệ tài khoản quản trị bằng mã TOTP ngoài mật khẩu.'}
            </span>
          </p>
          {enabled ? (
            <div className="table-actions">
              <button
                className="btn btn-secondary btn-sm" type="button" disabled={busy}
                onClick={() => setStep('disable')}
              >
                <ShieldOff size={14} aria-hidden /> Tắt 2FA
              </button>
            </div>
          ) : (
            <div className="table-actions">
              <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={startSetup}>
                <ShieldCheck size={14} aria-hidden /> {busy ? 'Đang tạo...' : 'Bật 2FA'}
              </button>
            </div>
          )}
        </>
      )}

      {step === 'setup' && setup && (
        <div className="page-stack">
          <div className="alert alert--warning" role="status">
            <div>
              <strong>Chưa bật — hãy quét hoặc nhập khoá dưới đây</strong>
              <p className="cell-meta">
                Thêm tài khoản vào ứng dụng xác thực (Google Authenticator, 1Password…),
                rồi nhập mã 6 số hiện ra.
              </p>
            </div>
          </div>
          <div className="form-field">
            <span className="form-label">Khoá bí mật (nhập tay)</span>
            <code className="k-mono">{setup.secret}</code>
          </div>
          <div className="form-field">
            <span className="form-label">Đường dẫn otpauth</span>
            <code className="k-mono mfa-otp-url">{setup.otpauthUrl}</code>
          </div>
          <label className="form-field">
            <span className="form-label">Mã xác thực 6 số</span>
            <input
              className="input mfa-code-input" value={code} inputMode="numeric"
              autoComplete="one-time-code" maxLength={6} autoFocus
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') void confirmEnable(); }}
            />
          </label>
          <div className="table-actions">
            <button
              className="btn btn-primary btn-sm" type="button" disabled={busy || code.length !== 6}
              onClick={() => void confirmEnable()}
            >
              <KeyRound size={14} aria-hidden /> {busy ? 'Đang kiểm tra...' : 'Xác nhận bật'}
            </button>
            <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={reset}>
              Hủy
            </button>
          </div>
        </div>
      )}

      {step === 'recovery' && recoveryCodes.length > 0 && (
        <div className="page-stack">
          <div className="alert alert--warning" role="status">
            <div>
              <strong>Lưu ngay {recoveryCodes.length} mã khôi phục</strong>
              <p className="cell-meta">
                Đây là lần duy nhất hiện mã dạng đọc được. Mất hết mã + mất ứng dụng xác thực
                là mất quyền đăng nhập tài khoản này.
              </p>
            </div>
          </div>
          <ul className="mfa-code-grid" aria-label="Mã khôi phục">
            {recoveryCodes.map((c) => <li key={c} className="k-mono">{c}</li>)}
          </ul>
          <div className="table-actions">
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => void copyCodes()}>
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              {copied ? 'Đã chép' : 'Chép tất cả'}
            </button>
            <button className="btn btn-primary btn-sm" type="button" onClick={reset}>
              Tôi đã lưu mã
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={step === 'disable'}
        onClose={reset}
        title="Tắt xác thực hai lớp?"
        description="Tài khoản chỉ còn mật khẩu. Nhập mã 6 số hiện tại (hoặc một mã khôi phục) để xác nhận."
        preview={(
          <label className="form-field">
            <span className="form-label">Mã xác thực hoặc mã khôi phục</span>
            <input
              className="input" value={code} autoComplete="one-time-code" autoFocus
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void confirmDisable(); }}
            />
          </label>
        )}
        confirmLabel="Tắt 2FA"
        busy={busy}
        onConfirm={() => void confirmDisable()}
      />
    </section>
  );
}
