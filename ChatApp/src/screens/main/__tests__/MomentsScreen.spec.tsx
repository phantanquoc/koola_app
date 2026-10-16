/**
 * Regression guard for the Moments real-post feed.
 *
 * Behavior locked in:
 *   1. Header (`MomentsFeedHeader`) ALWAYS renders as ListHeaderComponent,
 *      not gated behind stories or posts.
 *   2. The vertical list reads real post state (`data={posts}` where posts
 *      comes from the service), never mock modules.
 *   3. Post loading/error/empty are inline states — the story region stays a
 *      non-blocking banner inside the header flow, and post errors use an
 *      inline retryable `KoolaErrorState` (never a full-screen replacement).
 *   4. The empty feed shows a real empty state with a composer entry point
 *      (`handleComposerPress` → PostComposer), not mock data.
 *   5. No mock post/story modules remain referenced.
 *   6. All PostCard actions call real flows — no "chưa có backend" toasts.
 *
 * Static source analysis avoids heavy mocks (navigation, reanimated, auth,
 * momentsService) while asserting the behavioral contract.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('MomentsScreen - real post feed', () => {
  const sourcePath = path.resolve(__dirname, '../MomentsScreen.tsx');
  const source = fs.readFileSync(sourcePath, 'utf8');

  it('renders the feed header ALWAYS (not gated behind stories or posts)', () => {
    expect(source).toMatch(/ListHeaderComponent=\{listHeader\}/);
    expect(source).not.toMatch(/showMockPreview/);
  });

  it('feeds the vertical list from real post state', () => {
    expect(source).toMatch(/data=\{posts\}/);
    expect(source).toMatch(/momentsService\.getFeedPosts\(\)/);
  });

  it('does NOT gate the whole screen with a blocking empty state', () => {
    // The empty feed is a ListEmptyComponent (list-level), not a screen
    // replacement — the header chrome always renders.
    expect(source).not.toMatch(/if \(postsEmpty\) return/);
  });

  it('shows a real empty state with a composer entry point', () => {
    expect(source).toMatch(/Chưa có bài viết nào/);
    expect(source).toMatch(/handleComposerPress/);
    expect(source).toMatch(/navigation\.push\('PostComposer'\)/);
  });

  it('shows post errors as an inline retryable banner', () => {
    expect(source).toMatch(/state\.postsError/);
    expect(source).toMatch(/Không thể tải bài viết/);
    expect(source).toMatch(/onRetry=\{requestFeed\}/);
  });

  it('has no references to deleted mock modules', () => {
    expect(source).not.toMatch(/MOCK_MOMENTS_POSTS/);
    expect(source).not.toMatch(/momentsMockPosts/);
    expect(source).not.toMatch(/momentsMockStories/);
    expect(source).not.toMatch(/dữ liệu mẫu/);
  });

  it('has no "chưa có backend" toasts for post actions', () => {
    expect(source).not.toMatch(/chưa có backend/);
  });

  it('wires all PostCard actions to real flows', () => {
    expect(source).toMatch(/onPressComment=\{\(postId\) => void openComments\(postId\)\}/);
    expect(source).toMatch(/onPressShare=\{\(postId\) => void handleShare\(postId\)\}/);
    expect(source).toMatch(/onPressAuthor=\{handleAuthor\}/);
    expect(source).toMatch(/onPressMenu=\{handleMenu\}/);
    expect(source).toMatch(/onPressMedia=\{handleMedia\}/);
  });

  it('keeps the story-region error state retryable via requestFeed', () => {
    const errorBranch = (() => {
      const marker = "storyRegion === 'error'";
      const start = source.indexOf(marker);
      if (start === -1) return '';
      return source.slice(start, start + 2000);
    })();
    expect(errorBranch).not.toBe('');
    expect(errorBranch).toMatch(/<KoolaErrorState/);
    expect(errorBranch).toMatch(/onRetry=\{requestFeed\}/);
  });

  it('does not render a layout-shifting loading banner (cold load uses in-place rail skeletons)', () => {
    expect(source).not.toMatch(/ActivityIndicator/);
    expect(source).toMatch(/railLoading/);
  });
});
