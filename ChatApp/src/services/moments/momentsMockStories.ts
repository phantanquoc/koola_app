/**
 * Mock story data for Phase 1 ring rail — populates momentsService.feedRing
 * without backend dependency. Real avatars will come from backend in Phase 2.
 */

import type { FeedRingItem } from './momentsService';
import type { Story } from './momentsApi';

export const MOCK_STORY_RINGS: FeedRingItem[] = [
  {
    authorId: 'mock-u1',
    lastStoryId: 'mock-s1',
    hasUnviewed: true,
    authorDisplayName: 'Thu Hà',
    authorAvatar: null, // UserAvatar will show initials
  },
  {
    authorId: 'mock-u2',
    lastStoryId: 'mock-s2',
    hasUnviewed: true,
    authorDisplayName: 'Minh Quân',
    authorAvatar: null,
  },
  {
    authorId: 'mock-u3',
    lastStoryId: 'mock-s3',
    hasUnviewed: false,
    authorDisplayName: 'Ngọc Anh',
    authorAvatar: null,
  },
  {
    authorId: 'mock-u4',
    lastStoryId: 'mock-s4',
    hasUnviewed: true,
    authorDisplayName: 'Phương Vy',
    authorAvatar: null,
  },
];

/**
 * Matching stories by author. Phase 1 uses placeholder media; Phase 2 will
 * fetch real stories from backend. Each story has a single media item.
 */
export const MOCK_STORIES_BY_AUTHOR: [string, Story[]][] = [
  [
    'mock-u1',
    [
      {
        _id: 'mock-s1',
        storyGroupId: 'mock-group-1',
        overFlowIndex: 0,
        authorId: 'mock-u1',
        mediaKey: 'mock-media-1',
        mediaType: 'image',
        thumbnailKey: null,
        duration: null,
        caption: 'Bữa tối hôm nay: pasta carbonara tự làm + salad cá hồi 🍝🥗',
        mentions: [],
        musicRef: null,
        audienceScope: 'public',
        audienceListId: null,
        reactions: [],
        viewCount: 0,
        hasOverflow: false,
        isActive: true,
        expiresAt: null,
        createdAt: new Date(Date.now() - 9 * 3600 * 1000).toISOString(), // 9h ago
        updatedAt: new Date(Date.now() - 9 * 3600 * 1000).toISOString(),
      },
    ],
  ],
  [
    'mock-u2',
    [
      {
        _id: 'mock-s2',
        storyGroupId: 'mock-group-2',
        overFlowIndex: 0,
        authorId: 'mock-u2',
        mediaKey: 'mock-media-2',
        mediaType: 'image',
        thumbnailKey: null,
        duration: null,
        caption: 'Concert tối qua: âm thanh tuyệt, không khí cháy, một đêm khó quên 🎵✨',
        mentions: [],
        musicRef: null,
        audienceScope: 'public',
        audienceListId: null,
        reactions: [],
        viewCount: 0,
        hasOverflow: false,
        isActive: true,
        expiresAt: null,
        createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), // 5h ago
        updatedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
      },
    ],
  ],
  [
    'mock-u3',
    [
      {
        _id: 'mock-s3',
        storyGroupId: 'mock-group-3',
        overFlowIndex: 0,
        authorId: 'mock-u3',
        mediaKey: 'mock-media-3',
        mediaType: 'image',
        thumbnailKey: null,
        duration: null,
        caption: 'Chuyến đi Đà Lạt cuối tuần: sương sớm, cà phê nóng, thông xanh 🌲☕',
        mentions: [],
        musicRef: null,
        audienceScope: 'public',
        audienceListId: null,
        reactions: [],
        viewCount: 0,
        hasOverflow: false,
        isActive: true,
        expiresAt: null,
        createdAt: new Date(Date.now() - 14 * 3600 * 1000).toISOString(), // 14h ago (seen)
        updatedAt: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
      },
    ],
  ],
  [
    'mock-u4',
    [
      {
        _id: 'mock-s4',
        storyGroupId: 'mock-group-4',
        overFlowIndex: 0,
        authorId: 'mock-u4',
        mediaKey: 'mock-media-4',
        mediaType: 'video',
        thumbnailKey: null,
        duration: 12,
        caption: 'Hôm nay là ngày tốt lành ☀️',
        mentions: [],
        musicRef: null,
        audienceScope: 'public',
        audienceListId: null,
        reactions: [],
        viewCount: 0,
        hasOverflow: false,
        isActive: true,
        expiresAt: null,
        createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), // 3h ago
        updatedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      },
    ],
  ],
];
