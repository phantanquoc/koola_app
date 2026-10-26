import { useEffect, useState, type ReactNode } from 'react';
import Dialog from './Dialog';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /**
   * Preview slot: tóm tắt create/update/delete (description-list, diff,
   * identity...) để user chốt trước khi bấm. Render giữa description và nút.
   */
  preview?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  busy?: boolean;
  variant?: 'danger' | 'primary';
  /**
   * Type-to-confirm cho thao tác diện rộng/không undo (DESIGN.md §0.5):
   * nút confirm disabled tới khi nhập đúng chuỗi, so sánh case-sensitive.
   */
  requireText?: string;
}

/**
 * Confirm dùng chung cho mọi mutation (DESIGN.md §5 kit).
 * - Hủy đứng trước, hành động chính dồn phải. Hủy cũng là phần tử focus đầu
 *   tiên nên Enter/space không vô tình kích hoạt thao tác nguy hiểm.
 * - preview slot cho create/update/delete; requireText cho diện rộng.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  preview,
  confirmLabel,
  onConfirm,
  busy,
  variant = 'danger',
  requireText,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) setTyped('');
  }, [open ]);

  const needsTyping = !!requireText;
  const typingOk = !needsTyping || typed === requireText;
  const canConfirm = typingOk && !busy;

  return (
    <Dialog open={open} onClose={onClose} labelId="confirm-dialog-title" variant="dialog">
      <div className="dialog">
        <div className="dialog-header">
          <div>
            <h2 id="confirm-dialog-title" className="panel-title">{title}</h2>
            {description && <p className="panel-subtitle">{description}</p>}
          </div>
        </div>
        <div className="dialog-body">
          {preview && <div className="confirm-preview">{preview}</div>}
          {needsTyping && (
            <div className="confirm-typing">
              <label htmlFor="confirm-dialog-typing">
                Gõ <kbd>{requireText}</kbd> để xác nhận
              </label>
              <input
                id="confirm-dialog-typing"
                className="input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={requireText}
                autoComplete="off"
              />
            </div>
          )}
          <div className="dialog-actions confirm-actions">
            <button className="btn btn-secondary" onClick={onClose} disabled={busy} type="button">
              Hủy
            </button>
            <button
              className={variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={onConfirm}
              disabled={!canConfirm}
              type="button"
            >
              {busy ? 'Đang xử lý...' : (confirmLabel ?? 'Xác nhận')}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
