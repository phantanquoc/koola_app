import { useEffect, useRef, useCallback, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** aria-labelledby id for the dialog heading */
  labelId: string;
  /** 'dialog' centers on screen; 'drawer' slides from right */
  variant?: 'dialog' | 'drawer';
  children: ReactNode;
}

/**
 * Accessible dialog/drawer primitive.
 *
 * Features:
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

  // Capture the trigger element on open
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      previousOverflow.current = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      if (open) {
        document.body.style.overflow = previousOverflow.current;
      }
    };
  }, [open]);

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

  // Escape handler
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAndRestore();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, closeAndRestore]);

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

  return (
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
    </div>
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
