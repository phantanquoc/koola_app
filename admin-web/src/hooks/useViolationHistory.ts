import { useQuery } from '@tanstack/react-query';
import apiClient from '../apiClient';
import { auditActionLabel } from '../components/audit-labels';
import { reportStatusLabel } from '../components/report-labels';

export interface ViolationEntry {
  id: string;
  kind: 'report' | 'action';
  title: string;
  detail?: string;
  at?: string;
  /** Tên admin thao tác (audit) hoặc trạng thái (report). */
  meta?: string;
}

interface ReportRef {
  _id: string;
  reason: string;
  status: string;
  createdAt?: string;
  reporterName?: string;
}

interface AuditRef {
  _id: string;
  action: string;
  actorName?: string;
  payload?: { reason?: string; durationDays?: number } | null;
  createdAt?: string;
}

/**
 * Lịch sử vi phạm của một người dùng: báo cáo nhắm vào họ + thao tác quản trị
 * (cấm/gỡ cấm…).
 *
 * Lọc ở server theo `targetType`+`targetId` — bản cũ tải 100 audit log gần nhất
 * rồi lọc client, nên người dùng không có vi phạm gần đây (hoặc ít hoạt động)
 * hiện "Chưa có vi phạm" dù lịch sử vẫn còn trong DB.
 *
 * `accountType` quyết định loại đối tượng audit cần tra: lệnh cấm một tài khoản
 * doanh nghiệp được ghi với `targetType: 'business'` (để hiện trong timeline hồ
 * sơ doanh nghiệp), nên chỉ tra `user` là bỏ sót toàn bộ lệnh cấm.
 */
export function useViolationHistory(userId: string | null, accountType?: string) {
  const auditTargetType = accountType === 'business' ? 'business' : 'user';
  return useQuery({
    queryKey: ['violation-history', userId, auditTargetType],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ViolationEntry[]> => {
      const [reports, audits] = await Promise.all([
        apiClient
          .get<{ data: ReportRef[] }>('/admin/reports', {
            params: { targetType: 'user', targetId: userId, limit: 20 },
          })
          .then((r) => r.data.data ?? [])
          .catch(() => [] as ReportRef[]),
        apiClient
          .get<{ data: AuditRef[] }>('/admin/audit-logs', {
            params: { targetType: auditTargetType, targetId: userId, limit: 100, sort: 'createdAt:desc' },
          })
          .then((r) => r.data.data ?? [])
          .catch(() => [] as AuditRef[]),
      ]);

      const list: ViolationEntry[] = [
        ...reports.map((r) => ({
          id: r._id,
          kind: 'report' as const,
          title: `Bị báo cáo: ${r.reason}`,
          detail: r.reporterName ? `Người báo cáo: ${r.reporterName}` : undefined,
          at: r.createdAt,
          meta: reportStatusLabel(r.status),
        })),
        ...audits.map((a) => ({
          id: a._id,
          kind: 'action' as const,
          title: auditActionLabel(a.action),
          detail: a.payload?.reason
            ? `Lý do: ${a.payload.reason}${a.payload.durationDays ? ` · ${a.payload.durationDays} ngày` : ''}`
            : undefined,
          at: a.createdAt,
          meta: a.actorName ?? undefined,
        })),
      ];
      return list.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
    },
  });
}
