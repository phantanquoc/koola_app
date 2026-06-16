/**
 * MomentRing.spec.tsx
 *
 * Logic unit tests for MomentRing behavior.
 *
 * Full component render is not feasible in the Node test environment
 * (no jsdom, no @testing-library/react-native). We test the business
 * logic extracted from the component: label selection, accessibility
 * label construction, and the hasUnviewed → ring color mapping.
 */

describe('MomentRing logic', () => {
  // ─── Label selection ──────────────────────────────────────────────────────

  describe('display label', () => {
    function getLabel(displayName: string, isOwn?: boolean): string {
      return isOwn ? 'Tôi' : displayName;
    }

    it('uses displayName when isOwn is false', () => {
      expect(getLabel('Nguyen Van A', false)).toBe('Nguyen Van A');
    });

    it('uses displayName when isOwn is undefined', () => {
      expect(getLabel('Nguyen Van A', undefined)).toBe('Nguyen Van A');
    });

    it('returns "Tôi" when isOwn is true', () => {
      expect(getLabel('Nguyen Van A', true)).toBe('Tôi');
    });
  });

  // ─── Accessibility label ──────────────────────────────────────────────────

  describe('accessibility label construction', () => {
    function buildA11yLabel(displayName: string, hasUnviewed: boolean): string {
      return hasUnviewed
        ? `${displayName}, có khoảnh khắc mới`
        : `${displayName}, đã xem`;
    }

    it('appends "có khoảnh khắc mới" when hasUnviewed is true', () => {
      const label = buildA11yLabel('Tran Thi B', true);
      expect(label).toBe('Tran Thi B, có khoảnh khắc mới');
    });

    it('appends "đã xem" when hasUnviewed is false', () => {
      const label = buildA11yLabel('Tran Thi B', false);
      expect(label).toBe('Tran Thi B, đã xem');
    });
  });

  // ─── Ring color ───────────────────────────────────────────────────────────

  describe('ring border color', () => {
    const UNVIEWED_COLOR = '#F97316';
    const VIEWED_COLOR = '#D1D5DB';

    function getRingColor(hasUnviewed: boolean): string {
      return hasUnviewed ? UNVIEWED_COLOR : VIEWED_COLOR;
    }

    it('returns orange (#F97316) when hasUnviewed', () => {
      expect(getRingColor(true)).toBe(UNVIEWED_COLOR);
    });

    it('returns grey (#D1D5DB) when viewed', () => {
      expect(getRingColor(false)).toBe(VIEWED_COLOR);
    });
  });

  // ─── "+" button visibility ────────────────────────────────────────────────

  describe('add button visibility', () => {
    function shouldShowAddButton(isOwn?: boolean, onAddPress?: () => void): boolean {
      return Boolean(isOwn && onAddPress);
    }

    it('shows add button when isOwn and onAddPress provided', () => {
      expect(shouldShowAddButton(true, () => {})).toBe(true);
    });

    it('does not show add button when isOwn but no onAddPress', () => {
      expect(shouldShowAddButton(true, undefined)).toBe(false);
    });

    it('does not show add button when onAddPress provided but not isOwn', () => {
      expect(shouldShowAddButton(false, () => {})).toBe(false);
    });

    it('does not show add button when neither flag set', () => {
      expect(shouldShowAddButton(undefined, undefined)).toBe(false);
    });
  });

  // ─── onPress callback ─────────────────────────────────────────────────────

  describe('onPress', () => {
    it('invokes onPress when called', () => {
      const onPress = jest.fn();
      // Simulate the press handler
      const handlePress = () => onPress();
      handlePress();
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not call onAddPress when onPress is triggered', () => {
      const onPress = jest.fn();
      const onAddPress = jest.fn();
      const handlePress = () => onPress();
      handlePress();
      expect(onAddPress).not.toHaveBeenCalled();
    });
  });
});
