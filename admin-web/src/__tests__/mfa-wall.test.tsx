import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MfaRequiredWall } from '../components/MfaRequiredWall';

// Panel thật gọi /admin/me rồi mới render; ở đây chỉ cần biết wall có render nó.
vi.mock('../components/TwoFactorPanel', () => ({
  TwoFactorPanel: ({ userId }: { userId: string }) => (
    <div data-testid="two-factor-panel">{userId}</div>
  ),
}));

describe('MfaRequiredWall', () => {
  const original = window.location;

  beforeEach(() => {
    // `window.location.reload` không ghi đè được trực tiếp — thay cả object.
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...original, reload: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { writable: true, value: original });
  });

  it('render form bật 2FA thay vì nội dung admin', () => {
    render(<MfaRequiredWall userId="admin-1" />);

    expect(
      screen.getByRole('heading', { name: /Bật xác thực hai lớp/i }),
    ).toBeTruthy();
    expect(screen.getByTestId('two-factor-panel').textContent).toBe('admin-1');
  });

  // Thiếu id thì không gọi TwoFactorPanel (nó sẽ tự return null → màn hình trống).
  it('thiếu userId hiện cảnh báo thay vì khung trống', () => {
    render(<MfaRequiredWall />);

    expect(screen.queryByTestId('two-factor-panel')).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('nút tải lại gọi location.reload để đọc trạng thái mới từ server', () => {
    render(<MfaRequiredWall userId="admin-1" />);

    screen.getByRole('button', { name: /tải lại/i }).click();
    expect(window.location.reload).toHaveBeenCalled();
  });
});
