import { Link } from 'react-router-dom';
import { Building2, CircleDollarSign, Copy, FileCheck, Flag, Timer } from 'lucide-react';
import { VerificationBadge } from './StatusBadge';
import { useToast } from './Toast';
import { ageLabel, ageTone, formatDateTime, formatNumber, initials } from './formatters';
import { categoryVi, relationshipVi } from './vn-data';
import type { BusinessDetail } from './BusinessDetailDrawer';

/**
 * Rail trái của hồ sơ doanh nghiệp: danh tính + tín hiệu duyệt.
 *
 * Cùng pattern với `UserDetailRail`: khối *đọc*, mọi quyết định nằm ở cột
 * phải/bottombar. Moderator mở hồ sơ để trả lời "có nên duyệt không" — câu trả
 * lời là: xác minh tới đâu, giấy tờ có đủ không, chủ này có bao nhiêu hồ sơ,
 * bán được bao nhiêu.
 */
export function BusinessDetailRail({ data }: { data: BusinessDetail }) {
  const { addToast } = useToast();
  const commerce = data.commerceStats;
  const reports = data.reportStats;
  // Business chỉ bán, không mua — ẩn cả khối khi chưa có đơn nào, cùng quy tắc
  // với rail người dùng (không hiện "0 / 0" gây nhiễu).
  const hasCommerce = Boolean(commerce && commerce.ordersAsSeller > 0);

  return (
    <aside className="user-rail" aria-label="Tóm tắt hồ sơ">
      <div className="user-rail-identity">
        {data.logoUrl ? (
          <img className="user-rail-avatar" src={data.logoUrl} alt="" width={56} height={56} />
        ) : (
          <div className="user-rail-avatar user-rail-avatar--initial" aria-hidden="true">
            {initials(data.displayName, 'B')}
          </div>
        )}
        <div className="user-rail-name">
          <h2 className="user-rail-title">{data.displayName}</h2>
          <p className="cell-meta">
            {[data.businessCategory && categoryVi(data.businessCategory),
              data.province,
              data.relationshipType && relationshipVi(data.relationshipType),
            ].filter(Boolean).join(' · ') || 'Chưa rõ danh mục'}
          </p>
        </div>
        <div className="user-rail-badges">
          <VerificationBadge status={data.verificationStatus} />
          {data.suspended && !data.isBanned && (
            <span className="badge badge-muted">Tạm ngưng bán</span>
          )}
          {data.isBanned && <span className="badge badge-danger">Đang bị cấm</span>}
        </div>
      </div>

      <dl className="user-rail-signals">
        <div className="user-rail-signal">
          <dt>
            <FileCheck size={14} aria-hidden /> Mã số thuế
          </dt>
          <dd className="k-mono">{data.taxCode || '—'}</dd>
        </div>

        <div className="user-rail-signal">
          <dt>
            <Timer size={14} aria-hidden /> Giấy phép hết hạn
          </dt>
          <dd>
            {data.licenseExpiresAt ? formatDateTime(data.licenseExpiresAt) : (
              <span className="cell-meta">—</span>
            )}
          </dd>
        </div>

        <div className="user-rail-signal">
          <dt>
            <Timer size={14} aria-hidden /> Tuổi hồ sơ
          </dt>
          <dd>
            {/* Chỉ gọi là "chờ" khi còn pending — hồ sơ đã duyệt mà ghi "Đã chờ
                18 ngày" sẽ khiến moderator tưởng còn nợ việc. */}
            {ageLabel(data.createdAt)}{' '}
            {data.verificationStatus === 'pending' && (
              <span className={`badge badge-${ageTone(data.createdAt)}`}>chờ duyệt</span>
            )}
          </dd>
        </div>

        <div className="user-rail-signal">
          <dt>
            <Flag size={14} aria-hidden /> Báo cáo
          </dt>
          <dd>
            {reports && reports.total > 0 ? (
              <>
                <strong>{formatNumber(reports.pending)}</strong> đang chờ
                <span className="cell-meta"> / {formatNumber(reports.total)} tổng</span>
              </>
            ) : (
              <span className="cell-meta">Không có</span>
            )}
          </dd>
        </div>

        {hasCommerce && commerce && (
          <>
            <div className="user-rail-signal">
              <dt>
                <CircleDollarSign size={14} aria-hidden /> Đơn đã bán
              </dt>
              <dd>{formatNumber(commerce.ordersAsSeller)}</dd>
            </div>
            <div className="user-rail-signal">
              <dt>
                <CircleDollarSign size={14} aria-hidden /> Doanh thu đã giao
              </dt>
              <dd>{formatNumber(Math.round(commerce.gmvAsSeller))}₫</dd>
            </div>
          </>
        )}

        {data.owner !== undefined && (
          <div className="user-rail-signal">
            <dt>
              <Building2 size={14} aria-hidden /> Chủ tài khoản
            </dt>
            <dd>
              {data.owner ? (
                <>
                  <Link className="cell-link" to={`/users?search=${data.owner._id}`}>
                    {data.owner.displayName}
                  </Link>
                  {typeof data.ownerBusinessCount === 'number' &&
                    data.ownerBusinessCount > 1 && (
                      <span className="cell-meta">
                        {' '}· {data.ownerBusinessCount} hồ sơ
                      </span>
                    )}
                </>
              ) : (
                <span className="cell-meta">Admin tạo trực tiếp</span>
              )}
            </dd>
          </div>
        )}
      </dl>

      <div className="user-rail-id">
        <span className="cell-meta">Mã hồ sơ</span>
        <button
          className="detail-id"
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(data._id).then(
              () => addToast('success', 'Đã sao chép mã hồ sơ.'),
              () => addToast('error', 'Sao chép thất bại.'),
            );
          }}
          title={`Sao chép mã hồ sơ · ${data._id}`}
          aria-label="Sao chép mã hồ sơ"
        >
          <span className="k-mono">{data._id}</span>
          <Copy size={11} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
