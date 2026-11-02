import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../apiClient';
import { ConfirmDialog } from './ConfirmDialog';
import { StatusBadge } from './StatusBadge';
import { formatDateTime } from './formatters';
import { useToast } from './Toast';

interface MessageReport {
  _id: string;
  reason: string;
  status: string;
  reporterName?: string | null;
  createdAt?: string;
}

/**
 * Panel báo cáo của MỘT tin nhắn — tải lười khi moderator bấm badge trên dòng
 * tin (design D1): mỗi lần mở chỉ một query `targetId`-scoped, không gom cả
 * trang. Resolve/dismiss qua ConfirmDialog như hàng đợi cấp hội thoại.
 */
export function MessageReportPanel({
  messageId,
  onClose,
}: {
  messageId: string;
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    id: string;
    action: 'resolve' | 'dismiss';
    reason: string;
  } | null>(null);

  const reportsQuery = useQuery({
    queryKey: ['message-reports', messageId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: MessageReport[] }>('/admin/reports', {
        params: {
          targetType: 'message',
          targetId: messageId,
          status: 'pending',
          limit: 50,
        },
      });
      return (res.data.data ?? []).filter((r) => r.status === 'pending');
    },
    enabled: Boolean(messageId),
  });

  const reports = reportsQuery.data ?? [];

  async function act(reportId: string, action: 'resolve' | 'dismiss') {
    setBusy(reportId);
    try {
      await apiClient.post(`/admin/reports/${reportId}/${action}`);
      setConfirm(null);
      addToast(
        'success',
        action === 'resolve' ? 'Đã giải quyết báo cáo.' : 'Đã bỏ qua báo cáo.',
      );
      // Badge đếm nằm trong payload chi tiết → invalidate theo tiền tố.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['message-reports', messageId] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
        queryClient.invalidateQueries({ queryKey: ['conversation'] }),
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['conversations-stats'] }),
      ]);
    } catch {
      addToast('error', 'Thao tác báo cáo thất bại.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="conv-msg-reports" aria-label="Báo cáo của tin nhắn này">
      <div className="conv-msg-reports-head">
        <span className="cell-meta">
          {reportsQuery.isLoading
            ? 'Đang tải báo cáo…'
            : `Báo cáo chờ xử lý (${reports.length})`}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={onClose}
          aria-label="Đóng danh sách báo cáo"
        >
          <X size={14} strokeWidth={2} aria-hidden /> Đóng
        </button>
      </div>
      {reportsQuery.isError ? (
        <p className="cell-meta">Không tải được báo cáo.</p>
      ) : reports.length === 0 && !reportsQuery.isLoading ? (
        <p className="cell-meta">Không còn báo cáo chờ xử lý.</p>
      ) : (
        reports.map((r) => (
          <div key={r._id} className="surface-card conv-report">
            <div className="conv-report-history-head">
              <p className="cell-title">{r.reason}</p>
              <StatusBadge tone="warning" label="Chờ xử lý" />
            </div>
            <div className="cell-meta">
              {r.reporterName ?? 'Không rõ'} · {formatDateTime(r.createdAt)}
            </div>
            <div className="table-actions conv-report-actions">
              <button
                className="btn btn-primary btn-sm"
                type="button"
                disabled={busy === r._id}
                onClick={() =>
                  setConfirm({ id: r._id, action: 'resolve', reason: r.reason })
                }
              >
                <Check size={16} strokeWidth={2} aria-hidden /> Giải quyết
              </button>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                disabled={busy === r._id}
                onClick={() =>
                  setConfirm({ id: r._id, action: 'dismiss', reason: r.reason })
                }
              >
                <X size={16} strokeWidth={2} aria-hidden /> Bỏ qua
              </button>
            </div>
          </div>
        ))
      )}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
        title={
          confirm?.action === 'resolve'
            ? 'Đánh dấu báo cáo đã xử lý?'
            : 'Bỏ qua báo cáo này?'
        }
        description={
          confirm
            ? confirm.action === 'resolve'
              ? `“${confirm.reason}” — đóng báo cáo khỏi hàng đợi. Không gỡ nội dung; muốn gỡ thì dùng nút gỡ trên dòng tin.`
              : `“${confirm.reason}” — báo cáo bị bỏ qua và rời khỏi hàng đợi.`
            : undefined
        }
        confirmLabel={confirm?.action === 'resolve' ? 'Đánh dấu xử lý' : 'Bỏ qua'}
        variant={confirm?.action === 'resolve' ? 'primary' : 'danger'}
        busy={busy !== null}
        onConfirm={() => {
          if (confirm) void act(confirm.id, confirm.action);
        }}
      />
    </div>
  );
}
