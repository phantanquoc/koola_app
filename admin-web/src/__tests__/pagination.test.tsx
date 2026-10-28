import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pagination } from '../components/Pagination';

describe('Pagination', () => {
  it('dùng đúng danh từ của trang, không mặc định "hồ sơ"', () => {
    render(<Pagination page={1} totalPages={1} total={12} unit="người dùng" onPageChange={() => {}} />);
    expect(screen.getByText(/12 người dùng/)).toBeTruthy();
    expect(screen.queryByText(/hồ sơ/)).toBeNull();
  });

  it('nhiều trang thì hiện số trang + tổng', () => {
    render(<Pagination page={2} totalPages={3} total={45} unit="đơn hàng" onPageChange={() => {}} />);
    expect(screen.getByText(/Trang 2 \/ 3 · 45 đơn hàng/)).toBeTruthy();
  });

  it('không có dữ liệu thì không render footer', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} total={0} unit="track" onPageChange={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
