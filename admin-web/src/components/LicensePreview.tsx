import { useState } from 'react';
import Dialog from './Dialog';

interface LicensePreviewProps {
  /** The URL of the license image */
  url: string | null;
  /** Business name for labelling */
  businessName: string;
  /** Callback when a missing/broken image needs refresh */
  onRefresh?: () => void;
}

/**
 * In-context license preview with lightbox.
 *
 * - Shows thumbnail inline
 * - Opens full image in a lightbox dialog on click
 * - Handles missing/expired/broken images gracefully
 */
export default function LicensePreview({
  url,
  businessName,
  onRefresh,
}: LicensePreviewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (!url) {
    return (
      <div className="license-missing">
        <span className="badge badge-muted">Không có ảnh</span>
        {onRefresh && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onRefresh}
            type="button"
            aria-label={`Yêu cầu ảnh giấy phép mới từ ${businessName}`}
          >
            Yêu cầu lại
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        className="license-preview"
        onClick={() => setLightboxOpen(true)}
        type="button"
        aria-label={`Xem giấy phép của ${businessName}`}
      >
        <img
          className="license-thumb"
          src={url}
          alt={`Giấy phép doanh nghiệp ${businessName}`}
          onError={() => setImageError(true)}
        />
        <span>{imageError ? 'Ảnh lỗi' : 'Xem ảnh'}</span>
      </button>

      <Dialog
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        labelId="license-lightbox-title"
        variant="dialog"
      >
        <div className="dialog lightbox-dialog">
          <div className="dialog-header">
            <div>
              <div className="page-eyebrow">License evidence</div>
              <h2 id="license-lightbox-title" className="panel-title">
                Giấy phép — {businessName}
              </h2>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setLightboxOpen(false)}
              type="button"
            >
              Đóng
            </button>
          </div>
          <div className="dialog-body lightbox-body">
            {imageError ? (
              <div className="license-error-state">
                <p className="alert" role="alert">
                  Ảnh giấy phép không thể tải được. URL có thể đã hết hạn.
                </p>
                {onRefresh && (
                  <button
                    className="btn btn-secondary"
                    onClick={onRefresh}
                    type="button"
                  >
                    Yêu cầu ảnh mới
                  </button>
                )}
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                >
                  Thử mở link gốc
                </a>
              </div>
            ) : (
              <>
                <img
                  className="lightbox-image"
                  src={url}
                  alt={`Giấy phép doanh nghiệp ${businessName} — ảnh đầy đủ`}
                  onError={() => setImageError(true)}
                />
                <div className="lightbox-actions">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    Mở link gốc
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
