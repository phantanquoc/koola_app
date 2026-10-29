/**
 * Moments deep-link contract.
 *
 * A shared post link is `koola://moments/post/<postId>` — no author, because the
 * author is not derivable before the post is fetched (MomentViewer resolves it).
 * A story link is `koola://moments/story/<storyId>?authorId=<userId>`. Both must
 * land on the same MomentViewer route; the viewer decides which one it got.
 */
import { getStateFromPath } from '@react-navigation/native';
import { momentsLinking } from '../momentsLinking';

function routeParams(path: string): Record<string, unknown> | undefined {
  const state = getStateFromPath(path, momentsLinking.config) as any;
  // state → Main → ChatTab → MomentViewer
  return state?.routes?.[0]?.state?.routes?.[0]?.state?.routes?.[0]?.params;
}

describe('moments deep links', () => {
  it('routes a shared post link to MomentViewer with the post id', () => {
    expect(routeParams('moments/post/post-123')).toEqual({ startStoryId: 'post-123' });
  });

  it('routes a story link with its author', () => {
    expect(routeParams('moments/story/story-9?authorId=user-7')).toEqual({
      startStoryId: 'story-9',
      authorId: 'user-7',
    });
  });

  it('ignores paths outside the moments story/post pattern', () => {
    // A stray `moments/foo/<id>` must not open the viewer on garbage params.
    expect(routeParams('moments/foo/x')).toBeUndefined();
  });
});
