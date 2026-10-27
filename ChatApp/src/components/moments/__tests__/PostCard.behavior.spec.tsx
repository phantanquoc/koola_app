/**
 * PostCard — presentation regressions (moments D3/D5).
 *
 *   - the feed card no longer advertises dead "Thích / Trả lời" labels (B7)
 *   - the "Xem tất cả N bình luận" affordance survives an empty preview (B17)
 *   - React.memo holds a card still when its post identity is unchanged (B16)
 */
import React, { createElement } from 'react';
import { Text } from 'react-native';
// @ts-expect-error — react-test-renderer ships untyped in this repo (see ShoppingTabStack test)
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import type { FeedPost } from '../PostCard';

jest.mock('../../../components/MediaImage', () => 'MediaImage');
jest.mock('../../../components/UserAvatar', () => 'UserAvatar');
jest.mock('../PostMediaGrid', () => 'PostMediaGrid');

import PostCard from '../PostCard';

function post(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: 'p1',
    authorId: 'a1',
    authorDisplayName: 'An',
    timeLabel: '2 giờ',
    audience: 'public',
    caption: 'caption',
    media: [],
    reactionCount: 0,
    commentCount: 0,
    shareCount: 0,
    likedByMe: false,
    comments: [],
    ...overrides,
  };
}

function texts(root: ReactTestInstance): string[] {
  return root
    .findAll((n: ReactTestInstance) => n.type === Text)
    .map((n: ReactTestInstance) =>
      React.Children.toArray(n.props.children)
        .flat()
        .filter((c) => typeof c === 'string' || typeof c === 'number')
        .join(''),
    );
}

describe('PostCard', () => {
  it('does not render the dead "Thích"/"Trả lời" labels inside a comment preview', () => {
    const r = TestRenderer.create(
      <PostCard
        post={post({
          commentCount: 1,
          comments: [
            { id: 'c1', authorDisplayName: 'Bình', content: 'nội dung', timeLabel: '1 giờ' },
          ],
        })}
        contentWidth={360}
      />,
    );
    const all = texts(r.root);
    expect(all).toContain('Bình');
    expect(all).toContain('nội dung');
    expect(all).toContain('1 giờ');
    // The action bar's own "Thích" is expected; what must be gone is a SECOND
    // pair of labels inside the comment preview (the dead affordance).
    const at = all.indexOf('Bình'); // first comment row
    const previewTail = all.slice(at);
    expect(previewTail).toContain('1 giờ');
    expect(previewTail).not.toContain('Trả lời');
    expect(previewTail).not.toContain('Thích');
  });

  it('shows "Xem tất cả N bình luận" even when the preview is empty', () => {
    const r = TestRenderer.create(
      <PostCard post={post({ commentCount: 3, comments: [] })} contentWidth={360} />,
    );
    const entry = r.root.find(
      (n: ReactTestInstance) => typeof n.type !== 'string' && n.props.accessibilityLabel === 'Xem tất cả 3 bình luận',
    );
    expect(entry).toBeTruthy();
  });

  it('hides the comment block entirely when there are no comments at all', () => {
    const r = TestRenderer.create(<PostCard post={post()} contentWidth={360} />);
    const labels = r.root
      .findAll((n: ReactTestInstance) => typeof n.type !== 'string' && !!n.props.accessibilityLabel)
      .map((n: ReactTestInstance) => n.props.accessibilityLabel as string);
    expect(labels.some((l: string) => l.startsWith('Xem tất cả'))).toBe(false);
  });

  it('skips a re-render when the post identity is unchanged (memo)', () => {
    let innerRenders = 0;
    const CountingCard: React.FC<React.ComponentProps<typeof PostCard>> = (props) => {
      innerRenders++;
      return createElement(PostCard, props);
    };
    const Memoized = React.memo(CountingCard);

    const stable = post();
    const r = TestRenderer.create(<Memoized post={stable} contentWidth={360} />);
    expect(innerRenders).toBe(1);

    act(() => {
      r.update(<Memoized post={stable} contentWidth={360} />);
    });
    expect(innerRenders).toBe(1); // memo hit: no second render

    act(() => {
      r.update(<Memoized post={post()} contentWidth={360} />);
    });
    expect(innerRenders).toBe(2); // new identity: renders again
  });
});
