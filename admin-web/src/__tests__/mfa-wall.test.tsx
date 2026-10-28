import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MfaRequiredWall } from '../components/MfaRequiredWall';

// Panel thật gọi /admin/me rồi mới render; ở đây chỉ cần biết wall có render nó.
vi.mock('../components/TwoFactorPanel', () => ({
  TwoFactorPanel: ({ userId }: { userId: string }) => (
    <div data-testid="two-factor-panel">{userId}</div>
  ),
}));

const logout = vi.fn();
vi.mock('../useAuth', () => ({
  useAuth: () => ({ logout }),
}));

describe('MfaRequiredWall', () => {
  beforeEach(() => {
    logout.mockClear();
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

  // Wall tự mở sau khi bật 2FA (TwoFactorPanel gọi refreshIdentity) — nên KHÔNG
  // còn nút "tải lại" thủ công. Nếu ai thêm lại, test này chặn.
  it('không có nút tải lại thủ công', () => {
    render(<MfaRequiredWall userId="admin-1" />);

    expect(screen.queryByRole('button', { name: /tải lại/i })).toBeNull();
  });

  // Admin không muốn bật lúc này vẫn có lối thoát thay vì kẹt một màn hình.
  it('có nút đăng xuất gọi logout', () => {
    render(<MfaRequiredWall userId="admin-1" />);

    screen.getByRole('button', { name: /đăng xuất/i }).click();
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
