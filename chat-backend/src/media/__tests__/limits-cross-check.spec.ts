import { MAX_VIDEO_BYTES, MAX_IMAGE_BYTES } from '../media-limits.constants';
import {
  MAX_VIDEO_SIZE,
  MAX_IMAGE_SIZE,
} from '../../../../ChatApp/src/services/media/__generated__/media-limits';

describe('mobile/backend media limits parity', () => {
  it('MAX_VIDEO matches (run `npm run gen:limits` if values diverge)', () => {
    expect(MAX_VIDEO_SIZE).toBe(MAX_VIDEO_BYTES);
  });
  it('MAX_IMAGE matches (run `npm run gen:limits` if values diverge)', () => {
    expect(MAX_IMAGE_SIZE).toBe(MAX_IMAGE_BYTES);
  });
});
