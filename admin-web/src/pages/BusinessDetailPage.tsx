import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { BusinessDetailDrawer } from '../components/BusinessDetailDrawer';
import { BanDialog } from '../components/UserModeration';
import { useBusinessDecision } from '../hooks/useBusinessDecision';

/**
 * Route share URL (/businesses/:id, /businesses/new): form chi tiết giữa
 * màn hình, dùng chung logic với modal list (BusinessDetailDrawer embedded).
 * Quyết định duyệt/từ chối/vô hiệu hóa đi qua useBusinessDecision — cùng copy,
 * cùng confirm, cùng toast với trang danh sách.
 */
export default function BusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [banTarget, setBanTarget] = useState<{ id: string; name: string; action: 'ban' | 'unban' } | null>(null);
  const back = () => navigate('/businesses');

  const decision = useBusinessDecision({
    onChanged: () => {
      void queryClient.invalidateQueries({ queryKey: ['business', id] });
      void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    },
    undoable: true,
  });

  return (
    <div className="page-stack detail-page">
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
        embedded
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
