/**
 * PostComposerScreen — edit mode (moments D3/B6).
 *
 * The old Android flow showed a DELETE dialog under "Sửa bài viết". Editing is
 * now a screen: it seeds from the cached post, saves caption + audience through
 * momentsService.editPost, and never publishes a new post.
 */
import React from 'react';
// @ts-expect-error — react-test-renderer ships untyped in this repo (see ShoppingTabStack test)
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn().mockResolvedValue({ isConnected: true }) },
}));

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn(), push: jest.fn(), setOptions: jest.fn() };
let mockParams: Record<string, unknown> | undefined = { postId: 'p1' };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockParams }),
}));

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));

jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'me', displayName: 'Tôi' } }),
}));

jest.mock('../../../services/moments/momentsService', () => ({
  momentsService: {
    getState: jest.fn(),
    editPost: jest.fn(),
    createPost: jest.fn(),
  },
}));

jest.mock('../../../services/moments/postsApi', () => ({
  postsApi: { getPostById: jest.fn() },
}));

jest.mock('../../../services/media/mediaUploadService', () => ({
  uploadMedia: jest.fn(),
}));

jest.mock('../../../components/moments/MentionTextInput', () => 'MentionTextInput');

import { momentsService } from '../../../services/moments/momentsService';
import { postsApi } from '../../../services/moments/postsApi';
import PostComposerScreen from '../PostComposerScreen';

const svc = momentsService as unknown as Record<string, jest.Mock>;
const api = postsApi as unknown as Record<string, jest.Mock>;

const cachedPost = {
  _id: 'p1',
  id: 'p1',
  authorId: 'me',
  caption: 'caption cũ',
  audienceScope: 'connections',
  audienceListId: null,
  media: [],
  comments: [],
};

async function mount() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<PostComposerScreen />);
  });
  return renderer;
}

function byLabel(r: TestRenderer.ReactTestRenderer, label: string) {
  return r.root.find(
    (n: ReactTestInstance) => typeof n.type !== 'string' && n.props.accessibilityLabel === label,
  );
}

describe('PostComposerScreen edit mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { postId: 'p1' };
    svc.getState.mockReturnValue({ postsById: new Map([['p1', cachedPost]]) });
    svc.editPost.mockResolvedValue({ ...cachedPost, caption: 'mới' });
  });

  it('opens directly in edit mode seeded from the cached post', async () => {
    const r = await mount();
    const save = byLabel(r, 'Lưu thay đổi');
    expect(save).toBeTruthy();
    expect(JSON.stringify(r.toJSON())).toContain('caption cũ');
    expect(api.getPostById).not.toHaveBeenCalled();
  });

  it('saving edits the post and never creates a new one', async () => {
    const r = await mount();
    await act(async () => {
      byLabel(r, 'Lưu thay đổi').props.onPress();
    });

    expect(svc.editPost).toHaveBeenCalledWith('p1', {
      caption: 'caption cũ',
      audienceScope: 'connections',
      audienceListId: undefined,
    });
    expect(svc.createPost).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('create mode (no postId) keeps the publish label and posts', async () => {
    mockParams = undefined;
    const r = await mount();
    // Create mode starts on the media picker; "Bài viết mới" is its title.
    expect(JSON.stringify(r.toJSON())).toContain('Bài viết mới');
    expect(JSON.stringify(r.toJSON())).not.toContain('Sửa bài viết');
    expect(svc.editPost).not.toHaveBeenCalled();
  });
});
