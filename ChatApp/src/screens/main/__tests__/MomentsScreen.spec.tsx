/**
 * Regression guard for the Moments Phase-1 feed presentation.
 *
 * Bối cảnh hồi quy (2026-08-11, phát hiện trên thiết bị thật): bản sửa HIGH-1
 * trước đó gate CẢ MÀN HÌNH sau story thật — `showMockPreview` chỉ bật khi
 * resolver trả 'content', mà resolver lại tính từ `state.feedRing`. Máy user
 * chưa có story nào từ bạn bè → feedRing rỗng → cả `ListHeaderComponent` lẫn
 * `data` bị ẩn, nên user chỉ thấy empty state trắng, mất toàn bộ Pha 1 (ô gợi ý
 * đăng, ba thao tác nhanh, dải vòng story, các PostCard mẫu).
 *
 * Hành vi ĐÚNG mà test này khóa lại:
 *   1. Header (`MomentsFeedHeader`) LUÔN là ListHeaderComponent, không gate sau
 *      story thật.
 *   2. Feed mẫu LUÔN render trong Pha 1: `data={posts}`, không có công tắc bật/
 *      tắt cả danh sách.
 *   3. Trạng thái story rail (loading/error/friend-empty) là banner không chặn
 *      trong luồng header, không thay thế toàn bộ màn hình.
 *   4. Vẫn còn đường tạo khoảnh khắc ở trạng thái bạn bè chưa đăng
 *      (`actionLabel` + `onActionPress={handleAddPress}` mở MomentComposer).
 *
 * Theo pattern kiểm tra cấp màn hình trong repo (AccountListScreen.spec.tsx):
 * phân tích tĩnh mã nguồn để tránh mock nặng (navigation, reanimated, auth,
 * momentsService) mà vẫn xác nhận đúng hợp đồng regression. Các assertion dưới
 * đây mô tả cấu trúc hành vi, không khớp chuỗi copy mong manh.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('MomentsScreen - Phase 1 feed always renders', () => {
  const sourcePath = path.resolve(__dirname, '../MomentsScreen.tsx');
  const source = fs.readFileSync(sourcePath, 'utf8');

  it('renders the feed header ALWAYS (not gated behind real stories)', () => {
    // ListHeaderComponent must reference the always-built listHeader, never a
    // conditional preview flag.
    expect(source).toMatch(/ListHeaderComponent=\{listHeader\}/);
    expect(source).not.toMatch(/showMockPreview/);
  });

  it('feeds the vertical list from posts unconditionally in Phase 1', () => {
    // data must be the posts array directly, not `showMockPreview ? posts : []`.
    expect(source).toMatch(/data=\{posts\}/);
    expect(source).not.toMatch(/data=\{showMockPreview \? posts : \[\]\}/);
  });

  it('does NOT gate the whole screen with a ListEmptyComponent', () => {
    // The regression replaced the entire screen with an empty state. The story
    // region is now a non-blocking banner inside the header flow instead.
    expect(source).not.toMatch(/ListEmptyComponent=/);
  });

  it('composes the story-region banner inside the header flow', () => {
    expect(source).toMatch(/const listHeader = useMemo\(/);
    expect(source).toMatch(/\{storyRegionBanner\}/);
    expect(source).toMatch(/storyRegionBanner/);
  });

  it('derives the story region from friend rings, not any ring', () => {
    // The own ring is always synthesised, so `hasFriendRings` must be the
    // signal — otherwise a user with only their own ring reads as "content".
    expect(source).toMatch(/resolveMomentsStoryRegion\(/);
    expect(source).toMatch(/hasFriendRings:\s*otherRings\.length > 0/);
  });

  it('keeps a creation action on the friend-empty banner wired to handleAddPress', () => {
    const friendEmptyBranch = (() => {
      const marker = "storyRegion === 'friend-empty'";
      const start = source.indexOf(marker);
      if (start === -1) return '';
      const end = source.indexOf('return null;', start);
      return end === -1 ? source.slice(start) : source.slice(start, end);
    })();
    expect(friendEmptyBranch).not.toBe('');
    expect(friendEmptyBranch).toMatch(/<KoolaEmptyState/);
    expect(friendEmptyBranch).toMatch(/actionLabel=/);
    expect(friendEmptyBranch).toMatch(/onActionPress=\{handleAddPress\}/);
  });

  it('keeps the story-region error state retryable via requestFeed', () => {
    const errorBranch = (() => {
      const marker = "storyRegion === 'error'";
      const start = source.indexOf(marker);
      if (start === -1) return '';
      const end = source.indexOf("if (storyRegion === 'friend-empty')", start);
      return end === -1 ? source.slice(start) : source.slice(start, end);
    })();
    expect(errorBranch).not.toBe('');
    expect(errorBranch).toMatch(/<KoolaErrorState/);
    expect(errorBranch).toMatch(/onRetry=\{requestFeed\}/);
  });

  it('handleAddPress opens the MomentComposer route', () => {
    expect(source).toMatch(
      /handleAddPress\s*=\s*useCallback\(\(\)\s*=>\s*navigation\.push\('MomentComposer'\)/,
    );
  });

  it('keeps handleAddPress in the listHeader dependency array', () => {
    const depsMatch = source.match(
      /const listHeader = useMemo\([\s\S]*?\), \[([\s\S]*?)\]\);/,
    );
    expect(depsMatch).not.toBeNull();
    expect(depsMatch?.[1]).toMatch(/handleAddPress/);
    expect(depsMatch?.[1]).toMatch(/storyRegionBanner/);
  });
});
