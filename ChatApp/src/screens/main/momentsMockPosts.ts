/**
 * Dữ liệu Post mẫu cho Pha 1 của moments-feed-ui-phase1.
 *
 * Đây là scaffolding cục bộ, KHÔNG gọi backend và KHÔNG phụ thuộc mạng. Ảnh/video
 * dùng bundled asset trong `src/assets/mock-feed/` — offline, deterministic, render
 * giống nhau mọi lần chạy kể cả trong test. Avatar để trống nên UserAvatar hiển thị
 * chữ cái đầu. Pha 2 sẽ thay module này bằng nguồn Post thật mà không cần đổi
 * interface của PostCard hoặc media grid.
 */

import type { FeedPost } from '../../components/moments/PostCard';

/**
 * Một ô media với bundled asset. PostMediaGrid nhận `uri` từ `Image.resolveAssetSource`
 * và render qua `<Image source={{uri}}>` — hoàn toàn offline, không cần mạng.
 */
const photo = (asset: number, width: number, height: number): FeedPost['media'][number] => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const resolved = require('react-native').Image.resolveAssetSource(asset);
  return {
    mediaType: 'image',
    uri: resolved.uri,
    width,
    height,
  };
};
const clip = (
  asset: number,
  width: number,
  height: number,
  duration: number,
): FeedPost['media'][number] => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const resolved = require('react-native').Image.resolveAssetSource(asset);
  return {
    mediaType: 'video',
    uri: resolved.uri,
    width,
    height,
    duration,
  };
};

export const MOCK_MOMENTS_POSTS: FeedPost[] = [
  {
    id: 'p1',
    authorId: 'u1',
    authorDisplayName: 'Ngọc Anh',
    timeLabel: '2 giờ',
    audience: 'public',
    caption:
      'Chuyến đi Đà Lạt cuối tuần vừa rồi đẹp hơn mong đợi. Sương sớm, cà phê nóng, và một con đường thông dài vô tận. Nhất định sẽ quay lại vào tháng sau 🌲☕',
    media: [
      photo(require('../../assets/mock-feed/landscape-1.jpg'), 800, 600),
      photo(require('../../assets/mock-feed/landscape-2.jpg'), 800, 600),
    ],
    reactionCount: 34,
    commentCount: 12,
    shareCount: 3,
    likedByMe: false,
    comments: [
      {
        id: 'c1',
        authorDisplayName: 'Minh Quân',
        content: 'Ảnh thứ hai xuất sắc luôn 🔥',
        timeLabel: '1 giờ',
      },
    ],
  },
  {
    id: 'p2',
    authorId: 'u2',
    authorDisplayName: 'Minh Quân',
    timeLabel: '5 giờ',
    audience: 'public',
    caption: 'Ai mà nghĩ rằng công việc từ xa cũng có thể căng thẳng đến vậy 😅',
    media: [photo(require('../../assets/mock-feed/portrait-1.jpg'), 800, 1000)],
    reactionCount: 18,
    commentCount: 7,
    shareCount: 1,
    likedByMe: true,
    comments: [],
  },
  {
    id: 'p3',
    authorId: 'u3',
    authorDisplayName: 'Thu Hà',
    timeLabel: '9 giờ',
    audience: 'connections',
    caption: 'Bữa tối hôm nay: pasta carbonara tự làm + salad cá hồi. Ai đói chưa? 🍝🥗',
    media: [
      photo(require('../../assets/mock-feed/landscape-3.jpg'), 800, 600),
      photo(require('../../assets/mock-feed/landscape-1.jpg'), 800, 600),
      photo(require('../../assets/mock-feed/portrait-1.jpg'), 800, 1000),
    ],
    reactionCount: 52,
    commentCount: 20,
    shareCount: 6,
    likedByMe: false,
    comments: [],
  },
  {
    id: 'p4',
    authorId: 'u4',
    authorDisplayName: 'Đức Long',
    timeLabel: '1 ngày',
    audience: 'public',
    caption: 'Clip bóng đá trận tối qua. Bàn thắng phút 89 quá đỉnh! ⚽🔥',
    media: [clip(require('../../assets/mock-feed/video-poster.jpg'), 800, 600, 42)],
    reactionCount: 103,
    commentCount: 41,
    shareCount: 12,
    likedByMe: true,
    comments: [],
  },
  {
    id: 'p5',
    authorId: 'u5',
    authorDisplayName: 'Phương Vy',
    timeLabel: '1 ngày',
    audience: 'public',
    caption: 'Concert tối qua: âm thanh tuyệt, không khí cháy, một đêm khó quên 🎤✨',
    media: [
      photo(require('../../assets/mock-feed/landscape-2.jpg'), 800, 600),
      photo(require('../../assets/mock-feed/portrait-1.jpg'), 800, 1000),
      photo(require('../../assets/mock-feed/landscape-3.jpg'), 800, 600),
      photo(require('../../assets/mock-feed/landscape-1.jpg'), 800, 600),
    ],
    reactionCount: 89,
    commentCount: 28,
    shareCount: 9,
    likedByMe: false,
    comments: [],
  },
];
