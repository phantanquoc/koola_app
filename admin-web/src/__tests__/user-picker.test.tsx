import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserPicker, type UserOption } from '../components/UserPicker';

vi.mock('../apiClient', () => ({
  default: {
    get: vi.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const apiClient = (await import('../apiClient')).default as unknown as {
  get: ReturnType<typeof vi.fn>;
};

const ROWS = [
  { _id: '507f1f77bcf86cd799439011', displayName: 'Nguyễn Văn An', email: 'an@koola.dev', accountType: 'personal' },
  { _id: '507f1f77bcf86cd799439012', displayName: 'Trà Việt', email: 'tra@koola.invalid', accountType: 'business' },
];

describe('UserPicker', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.get.mockResolvedValue({ data: { data: ROWS } });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderPicker(value: UserOption[] = [], onChange = vi.fn()) {
    render(
      <UserPicker label="Người nhận" inputId="picker" value={value} onChange={onChange} />,
    );
    return onChange;
  }

  /** Gõ ≥2 ký tự rồi chờ debounce, trả về input để assert tiếp. */
  async function type(q: string) {
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: q } });
    await vi.advanceTimersByTimeAsync(350);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    return input;
  }

  it('gõ ≥2 ký tự thì tra server và hiện gợi ý kèm email', async () => {
    renderPicker();
    await type('nguyễn');

    expect(apiClient.get).toHaveBeenCalledWith('/admin/users', {
      params: { search: 'nguyễn', limit: 6 },
    });
    expect(screen.getByRole('option', { name: /Nguyễn Văn An/ }).textContent).toContain('an@koola.dev');
  });

  // Gõ 1 ký tự sẽ trả cả nghìn người — không hữu ích và tốn query.
  it('gõ 1 ký tự thì chưa tra', async () => {
    renderPicker();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'a' } });
    await vi.advanceTimersByTimeAsync(400);

    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('click gợi ý thêm chip với đúng id và tên', async () => {
    const onChange = renderPicker();
    await type('nguyễn');

    fireEvent.mouseDown(screen.getByRole('option', { name: /Nguyễn Văn An/ }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: '507f1f77bcf86cd799439011', name: 'Nguyễn Văn An' }),
    ]);
  });

  it('Enter chọn đúng option đang active, ↓ đổi active', async () => {
    const onChange = renderPicker();
    // ≥2 ký tự mới tra server — gõ 1 ký tự thì không có gợi ý để chọn.
    const input = await type('an');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: '507f1f77bcf86cd799439012' }),
    ]);
  });

  it('người đã chọn bị đánh dấu, không thêm lần hai', async () => {
    const onChange = renderPicker([
      { id: '507f1f77bcf86cd799439011', name: 'Nguyễn Văn An' },
    ]);
    await type('nguyễn');

    const opt = screen.getByRole('option', { name: /Nguyễn Văn An/ });
    expect(opt.getAttribute('aria-disabled')).toBe('true');
    fireEvent.mouseDown(opt);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('bấm ✕ trên chip gỡ đúng người', async () => {
    const onChange = renderPicker([
      { id: 'a', name: 'An' },
      { id: 'b', name: 'Bình' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Gỡ An' }));

    expect(onChange).toHaveBeenCalledWith([{ id: 'b', name: 'Bình' }]);
  });

  it('server lỗi → hiện lỗi, không làm sập form', async () => {
    apiClient.get.mockRejectedValue(new Error('down'));
    renderPicker();
    await type('nguyễn');

    await waitFor(() => expect(screen.getByText(/Không tra được người dùng/)).toBeTruthy());
  });
});
