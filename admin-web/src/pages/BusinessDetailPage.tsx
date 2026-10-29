import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { BusinessDetailDrawer } from '../components/BusinessDetailDrawer';
import { BanDialog } from '../components/UserModeration';
import { useBusinessDecision } from '../hooks/useBusinessDecision';

/**
 * Route chi tiết (/businesses/:id, /businesses/new): form chi tiết giữa màn
 * hình — §3B, không dùng drawer/modal.
 *
 * `state.from` giữ filter + trang của list để "Quay lại danh sách" đưa về đúng
 * chỗ vừa làm việc; mở link trực tiếp (không có state) thì về list trơn.
 */
export default function BusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [banTarget, setBanTarget] = useState<{ id: string; name: string; action: 'ban' | 'unban' } | null>(null);
  const backTo = (location.state as { from?: string } | null)?.from ?? '/businesses';
  const back = () => navigate(backTo);

  const decision = useBusinessDecision({
    onChanged: () => {
      void queryClient.invalidateQueries({ queryKey: ['business', id] });
      void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    },
    undoable: true,
  });

  return (
    <div className="page-stack detail-page detail-page--split">
      <button className="btn btn-ghost btn-sm detail-back" type="button" onClick={back}>
        <ArrowLeft size={14} aria-hidden /> Quay lại danh sách
      </button>

      <BusinessDetailDrawer
        businessId={id ?? null}
        onClose={back}
        onApprove={(bid, displayName) => decision.requestApprove({ id: bid, displayName })}
        onReject={(bid, displayName) => decision.requestReject({ id: bid, displayName })}
        onSuspend={(bid, displayName, suspend) => decision.requestSuspend({ id: bid, displayName, suspend })}
        onBan={(bid, displayName, ban) =>
          setBanTarget({ id: bid, name: displayName, action: ban ? 'ban' : 'unban' })
        }
      />

      {decision.dialogs}

      <BanDialog
        target={banTarget}
        onClose={() => setBanTarget(null)}
        onDone={() => {
          setBanTarget(null);
          void queryClient.invalidateQueries({ queryKey: ['business', id] });
          void queryClient.invalidateQueries({ queryKey: ['businesses'] });
        }}
      />
    </div>
  );
}
