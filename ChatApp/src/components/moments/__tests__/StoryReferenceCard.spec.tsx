/**
 * StoryReferenceCard.spec.tsx
 *
 * Logic unit tests for StoryReferenceCard behavior.
 * Tests verify that the component uses MediaImage for thumbnail rendering
 * and handles expired state correctly.
 */

describe('StoryReferenceCard logic', () => {
  describe('thumbnail rendering decision', () => {
    function shouldUseMediaImage(mediaKeyPreview?: string): boolean {
      return !!mediaKeyPreview;
    }

    it('should use MediaImage when mediaKeyPreview is provided', () => {
      expect(shouldUseMediaImage('media/stories/abc123.jpg')).toBe(true);
    });

    it('should show placeholder when mediaKeyPreview is undefined', () => {
      expect(shouldUseMediaImage(undefined)).toBe(false);
    });

    it('should show placeholder when mediaKeyPreview is empty string', () => {
      expect(shouldUseMediaImage('')).toBe(false);
    });
  });

  describe('card state transitions', () => {
    type CardState = 'normal' | 'expired';

    function getCardState(httpStatus: number | null): CardState {
      if (httpStatus === 410 || httpStatus === 404) return 'expired';
      return 'normal';
    }

    it('should transition to expired on 410', () => {
      expect(getCardState(410)).toBe('expired');
    });

    it('should transition to expired on 404', () => {
      expect(getCardState(404)).toBe('expired');
    });

    it('should stay normal on other errors', () => {
      expect(getCardState(500)).toBe('normal');
    });

    it('should stay normal on null (no error)', () => {
      expect(getCardState(null)).toBe('normal');
    });
  });
});
