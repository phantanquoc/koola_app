/**
 * `post` là loại đối tượng thứ năm của Report. Trước đây nó rơi vào nhánh
 * `default` nên nhãn lộ nguyên mã `post` và không có link mở đối tượng.
 */
import { describe, it, expect } from 'vitest';
import {
  REPORT_TARGET_LABELS,
  reportTargetHref,
  reportTargetLabel,
} from '../components/report-labels';

describe('report-labels — target type post', () => {
  it('dịch post sang tiếng Việt thay vì trả mã thô', () => {
    expect(reportTargetLabel('post')).toBe('Bài đăng');
    expect(REPORT_TARGET_LABELS.post).toBe('Bài đăng');
  });

  it('trỏ về danh sách bài đăng với focus để trang tự tải đúng bài', () => {
    expect(reportTargetHref('post', 'abc 123')).toBe('/posts?focus=abc%20123');
  });

  it('không có option lọc nào bị thiếu: mọi loại trong map đều có route', () => {
    for (const type of Object.keys(REPORT_TARGET_LABELS)) {
      expect(reportTargetHref(type, 'x')).not.toBeNull();
    }
  });
});
