/**
 * ConfirmDialog dùng chung (DESIGN.md §5 kit): preview slot, type-to-confirm,
 * thứ tự Hủy trước — destructive sau.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

function renderDialog(props?: Partial<React.ComponentProps<typeof ConfirmDialog>>) {
  return render(
    createElement(ConfirmDialog, {
      open: true,
      onClose: () => undefined,
      title: 'Xóa bản ghi?',
      onConfirm: () => undefined,
      ...props,
    }),
  );
}

describe('ConfirmDialog', () => {
  it('renders preview content between description and actions', () => {
    renderDialog({
      description: 'Hành động này có thể xem lại.',
      preview: createElement('div', null, 'preview-content'),
    });
    expect(screen.getByText('Hành động này có thể xem lại.')).toBeTruthy();
    expect(screen.getByText('preview-content')).toBeTruthy();
  });

  it('places cancel before the destructive confirm (safer default focus)', () => {
    renderDialog();
    const buttons = screen.getAllByRole('button');
    const labels = buttons.map((b) => b.textContent);
    expect(labels.indexOf('Hủy')).toBeLessThan(labels.indexOf('Xác nhận'));
  });

  it('disables confirm until requireText matches exactly', () => {
    const onConfirm = vi.fn();
    renderDialog({ requireText: 'DELETE', onConfirm });
    const confirm = screen.getByRole('button', { name: 'Xác nhận' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Gõ/), { target: { value: 'delete' } });
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Gõ/), { target: { value: 'DELETE' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('resets typed text when reopened', () => {
    const { rerender } = renderDialog({ requireText: 'DELETE' });
    fireEvent.change(screen.getByLabelText(/Gõ/), { target: { value: 'DELETE' } });
    rerender(
      createElement(ConfirmDialog, {
        open: false,
        onClose: () => undefined,
        title: 'Xóa bản ghi?',
        onConfirm: () => undefined,
        requireText: 'DELETE',
      }),
    );
    rerender(
      createElement(ConfirmDialog, {
        open: true,
        onClose: () => undefined,
        title: 'Xóa bản ghi?',
        onConfirm: () => undefined,
        requireText: 'DELETE',
      }),
    );
    expect(
      (screen.getByLabelText(/Gõ/) as HTMLInputElement).value,
    ).toBe('');
  });
});
