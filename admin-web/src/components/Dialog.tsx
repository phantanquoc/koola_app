import { useEffect, useRef, useCallback, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Stack hộp thoại đang mở — Escape/backdrop chỉ đóng cái trên cùng. */
const openDialogs: string[] = [];

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** aria-labelledby id for the dialog heading */
  labelId: string;
  /** 'dialog' centers (520px); 'wide' centers (720px form); 'drawer' slides from right */
  variant?: 'dialog' | 'wide' | 'drawer';
  children: ReactNode;
}

/**
 * Accessible dialog/drawer primitive.
 *
 * Features:
 * - Portal to document.body: hộp thoại lồng nhau (lightbox trong hồ sơ) không bị
 *   cắt bởi `overflow: hidden` hay containing block của overlay cha.
 * - Focus trap (Tab/Shift+Tab cycle within)
 * - Escape key closes
 * - Focus moves to first focusable element on open
 * - Focus returns to trigger on close
 * - Body scroll lock while open
 * - Backdrop click closes
 */
export default function Dialog({
  open,
  onClose,
  labelId,
  variant = 'dialog',
  children,
}: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const previousOverflow = useRef<string>('');
  const dialogId = useId();

  // Capture the trigger element on open; register in the dialog stack so only
  // the top-most dialog reacts to Escape.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    openDialogs.push(dialogId);
    return () => {
      const idx = openDialogs.lastIndexOf(dialogId);
      if (idx !== -1) openDialogs.splice(idx, 1);
      if (openDialogs.length === 0) {
        document.body.style.overflow = previousOverflow.current;
      }
    };
  }, [open, dialogId]);

  // Move focus into the dialog on open
  useEffect(() => {
    if (!open || !overlayRef.current) return;
    const focusable = getFocusableElements(overlayRef.current);
    if (focusable.length > 0) {
      (focusable[0] as HTMLElement).focus();
    } else {
      overlayRef.current.focus();
    }
  }, [open]);

  // Return focus to trigger on close
  const closeAndRestore = useCallback(() => {
    onClose();
    // Delay focus restore to next frame so the DOM has updated
    requestAnimationFrame(() => {
      if (triggerRef.current && triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    });
  }, [onClose]);

  // Escape handler — chỉ hộp thoại trên cùng đóng
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (openDialogs[openDialogs.length - 1] !== dialogId) return;
      e.preventDefault();
      closeAndRestore();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, closeAndRestore, dialogId])

  // Focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Tab' || !overlayRef.current) return;
      const focusable = getFocusableElements(overlayRef.current);
      if (focusable.length === 0) return;

      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [],
  );

  // Backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) {
        closeAndRestore();
      }
    },
    [closeAndRestore],
  );

  if (!open) return null;

  const overlayClass =
    variant === 'drawer' ? 'overlay' : 'overlay dialog-overlay';

  return createPortal(
    <div
      ref={overlayRef}
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      tabIndex={-1}
    >
      {children}
    </div>,
    document.body,
  );
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(container.querySelectorAll<HTMLElement>(selector));
}
