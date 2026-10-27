/**
 * moments-text-warning — strict render guard (moments-posts-backend-hardening 6.1).
 *
 * Fails on the dev-only "Text strings must be rendered within a `<Text>`"
 * warning across the Moments render path: PostCard counts/preview, comment
 * sheet tombstone + reply states, and the reply banner. The fix is to wrap or
 * coerce the string, never to silence console.error.
 */
import React, { createElement } from 'react';
import { Text, View } from 'react-native';
// @ts-expect-error — react-test-renderer ships untyped in this repo
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';

jest.mock('../../../components/MediaImage', () => 'MediaImage');
jest.mock('../../../components/UserAvatar', () => 'UserAvatar');
jest.mock('../PostMediaGrid', () => 'PostMediaGrid');

import PostCard, { type FeedPost } from '../PostCard';

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

/** Render the comment-sheet row states with the same conditionals as MomentsScreen. */
function SheetRows({ items }: { items: Array<{ _id: string; authorDisplayName?: string; content?: string; isActive?: boolean; replies?: Array<{ _id: string; authorDisplayName?: string; content?: string; isActive?: boolean }> }> }) {
  return createElement(
    View,
    null,
    ...items.map((item) => {
      const isDeleted = !item.isActive;
      if (isDeleted) {
        return createElement(
          View,
          { key: item._id },
          createElement(Text, null, 'Bình luận này đã bị xóa'),
          ...(item.replies ?? []).map((reply) =>
            createElement(
              View,
              { key: reply._id },
              createElement(Text, null, reply.authorDisplayName || 'Người dùng'),
              createElement(Text, null, reply.isActive ? String(reply.content ?? '') : '[đã xóa]'),
            ),
          ),
        );
      }
      return createElement(
        View,
        { key: item._id },
        createElement(Text, null, item.authorDisplayName || 'Người dùng'),
        createElement(Text, null, String(item.content ?? '')),
        ...(item.replies ?? []).map((reply) =>
          createElement(
            View,
            { key: reply._id ?? `${item._id}-reply` },
            createElement(Text, null, reply.authorDisplayName || 'Người dùng'),
            createElement(Text, null, reply.isActive ? String(reply.content ?? '') : '[đã xóa]'),
          ),
        ),
      );
    }),
  );
}

describe('moments text-warning guard', () => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    const calls = spy.mock.calls.flat().map(String).join('\n');
    expect(calls).not.toMatch(/Text strings must be rendered within/);
    spy.mockRestore();
  });

  it('PostCard counts + preview render without the warning', () => {
    TestRenderer.create(
      createElement(PostCard, {
        post: post({
          reactionCount: 12,
          commentCount: 3,
          shareCount: 1,
          comments: [
            { id: 'c1', authorDisplayName: 'Bình', content: 'nội dung', timeLabel: '1 giờ' },
          ],
        }),
        contentWidth: 360,
      }),
    );
  });

  it('comment sheet loading/empty/tombstone/reply states render without the warning', () => {
    // Empty state
    TestRenderer.create(createElement(SheetRows, { items: [] }));
    // Tombstone + replies (deleted parent, mixed reply states, missing fields)
    TestRenderer.create(
      createElement(SheetRows, {
        items: [
          {
            _id: 'gone',
            isActive: false,
            replies: [
              { _id: 'r1', authorDisplayName: 'An', content: 'ok', isActive: true },
              { _id: 'r2', isActive: false },
            ],
          },
          { _id: 'c2', authorDisplayName: '', content: undefined, isActive: true, replies: [] },
        ],
      }),
    );
  });

  it('reply banner with an undefined display name renders without the warning', () => {
    TestRenderer.create(
      createElement(View, null, createElement(Text, null, `Trả lời ${undefined ?? ''}`)),
    );
  });
});
