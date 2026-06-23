/**
 * StatusBadge.tsx
 *
 * Maps a verification status to the existing badge classes + a paired label so
 * the state is understandable without relying on color alone. Centralizes the
 * status→tone mapping that pages previously duplicated.
 */

type Tone = 'success' | 'warning' | 'danger' | 'muted' | 'primary';

const VERIFICATION_TONE: Record<string, Tone> = {
  verified: 'success',
  pending: 'warning',
  rejected: 'danger',
};

const VERIFICATION_LABEL: Record<string, string> = {
  verified: 'Đã xác minh',
  pending: 'Chờ duyệt',
  rejected: 'Từ chối',
};

export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

/** Verification-status badge with a built-in tone + Vietnamese label mapping. */
export function VerificationBadge({ status }: { status?: string }) {
  const tone = (status && VERIFICATION_TONE[status]) || 'muted';
  const label = (status && VERIFICATION_LABEL[status]) || status || '—';
  return <StatusBadge tone={tone} label={label} />;
}
