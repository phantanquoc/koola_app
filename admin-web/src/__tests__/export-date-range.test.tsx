import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportDateRange } from '../components/ExportDateRange';

describe('ExportDateRange', () => {
  it('tóm tắt số ngày khi có đủ hai mốc', () => {
    render(
      <ExportDateRange
        from="2026-10-01T00:00:00.000Z"
        to="2026-10-07T23:59:59.999Z"
        onChange={() => {}}
      />,
    );
    // 01 → 07 tính cả hai đầu = 7 ngày
    expect(screen.getByText(/7 ngày/)).toBeTruthy();
  });

  it('chưa chọn gì → "Mọi thời điểm"', () => {
    render(<ExportDateRange from="" to="" onChange={() => {}} />);
    expect(screen.getByText(/Mọi thời điểm/)).toBeTruthy();
  });

  // Khoảng ngược là lỗi người dùng, phải nói ra chứ không im lặng xuất file rỗng.
  it('khoảng ngược → cảnh báo, không hiện số ngày âm', () => {
    render(
      <ExportDateRange
        from="2026-10-10T00:00:00.000Z"
        to="2026-10-01T23:59:59.999Z"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/ngược/);
  });

  it('preset 7 ngày đặt đúng khoảng kết thúc hôm nay', () => {
    const onChange = vi.fn();
    render(<ExportDateRange from="" to="" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '7 ngày' }));

    const patch = onChange.mock.calls[0][0] as { from: string; to: string };
    const days =
      (new Date(patch.to).getTime() - new Date(patch.from).getTime()) / 86_400_000;
    // 7 ngày bao gồm hôm nay → 00:00 hôm đầu tới 23:59:59.999 hôm cuối ≈ 7 ngày.
    expect(Math.round(days)).toBe(7);
    expect(new Date(patch.from).getHours()).toBe(0);
    expect(new Date(patch.to).getHours()).toBe(23);
  });

  it('nút bỏ khoảng ngày chỉ hiện khi đang có lọc', () => {
    const { rerender } = render(<ExportDateRange from="" to="" onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: /Bỏ khoảng ngày/ })).toBeNull();

    rerender(
      <ExportDateRange from="2026-10-01T00:00:00.000Z" to="" onChange={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /Bỏ khoảng ngày/ })).toBeTruthy();
  });
});
