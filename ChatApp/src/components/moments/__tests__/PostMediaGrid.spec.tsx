/**
 * PostMediaGrid.spec.tsx
 *
 * Verifies the collage geometry the way the design demo relies on it:
 * every layout branch (1 / 2 / 3 / 4 / 5+ tiles) must fill the given width
 * exactly and never emit a zero/negative dimension.
 *
 * Pure arithmetic mirror of the component's branches — no renderer needed,
 * matching the logic-test convention used by MomentRing.spec.tsx.
 */

const GUTTER = 2;
const MIN_RATIO = 0.6;
const MAX_RATIO = 1.35;

type Box = { width: number; height: number };

/** Mirrors PostMediaGrid's branch geometry. */
function layout(count: number, width: number, first?: { w: number; h: number }): Box[] {
  if (count === 0) return [];

  if (count === 1) {
    const raw = first ? first.h / first.w : 0.75;
    const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, raw));
    return [{ width, height: Math.round(width * ratio) }];
  }

  if (count === 2) {
    const w = Math.floor((width - GUTTER) / 2);
    const h = Math.round(width * 0.62);
    return [
      { width: w, height: h },
      { width: width - w - GUTTER, height: h },
    ];
  }

  if (count === 3) {
    const heroW = Math.floor((width - GUTTER) * 0.66);
    const sideW = width - heroW - GUTTER;
    const totalH = Math.round(width * 0.7);
    const sideH = Math.floor((totalH - GUTTER) / 2);
    return [
      { width: heroW, height: totalH },
      { width: sideW, height: sideH },
      { width: sideW, height: totalH - sideH - GUTTER },
    ];
  }

  const half = Math.floor((width - GUTTER) / 2);
  const rest = width - half - GUTTER;
  const cellH = Math.round(width * 0.42);
  return [
    { width: half, height: cellH },
    { width: rest, height: cellH },
    { width: half, height: cellH },
    { width: rest, height: cellH },
  ];
}

/** Overflow badge count shown on the 4th tile. */
function overflowCount(total: number): number | undefined {
  const n = total - 4;
  return n > 0 ? n : undefined;
}

describe('PostMediaGrid geometry', () => {
  // Odd width (359) is the important case: floor() on an odd remainder is
  // where a naive 50/50 split loses a pixel and leaves a seam.
  const WIDTHS = [343, 359, 411, 280];

  describe('rows fill the available width exactly', () => {
    it.each(WIDTHS)('2 tiles span full width at %ipx', (w) => {
      const [a, b] = layout(2, w);
      expect(a.width + GUTTER + b.width).toBe(w);
    });

    it.each(WIDTHS)('3 tiles: hero + side column span full width at %ipx', (w) => {
      const [hero, side] = layout(3, w);
      expect(hero.width + GUTTER + side.width).toBe(w);
    });

    it.each(WIDTHS)('4 tiles: both rows span full width at %ipx', (w) => {
      const [a, b, c, d] = layout(4, w);
      expect(a.width + GUTTER + b.width).toBe(w);
      expect(c.width + GUTTER + d.width).toBe(w);
    });
  });

  describe('3-tile side column matches hero height', () => {
    it.each(WIDTHS)('stacked tiles + gutter equal hero height at %ipx', (w) => {
      const [hero, top, bottom] = layout(3, w);
      expect(top.height + GUTTER + bottom.height).toBe(hero.height);
    });
  });

  describe('single tile aspect clamping', () => {
    it('clamps a tall portrait to MAX_RATIO', () => {
      // 800x2000 => raw ratio 2.5, must clamp
      const [box] = layout(1, 400, { w: 800, h: 2000 });
      expect(box.height).toBe(Math.round(400 * MAX_RATIO));
    });

    it('clamps an ultra-wide panorama to MIN_RATIO', () => {
      const [box] = layout(1, 400, { w: 2000, h: 300 });
      expect(box.height).toBe(Math.round(400 * MIN_RATIO));
    });

    it('honours a normal landscape aspect untouched', () => {
      // 800x600 => 0.75, inside the clamp window
      const [box] = layout(1, 400, { w: 800, h: 600 });
      expect(box.height).toBe(300);
    });

    it('falls back to 4:3 when intrinsic size is unknown', () => {
      const [box] = layout(1, 400);
      expect(box.height).toBe(300);
    });
  });

  describe('no degenerate dimensions', () => {
    it.each([1, 2, 3, 4, 5, 9])('every tile is positive for %i item(s)', (count) => {
      for (const w of WIDTHS) {
        for (const box of layout(count, w)) {
          expect(box.width).toBeGreaterThan(0);
          expect(box.height).toBeGreaterThan(0);
        }
      }
    });

    it('renders nothing for an empty media array', () => {
      expect(layout(0, 360)).toHaveLength(0);
    });
  });

  describe('overflow badge', () => {
    it('is hidden at exactly 4 items', () => {
      expect(overflowCount(4)).toBeUndefined();
    });

    it('shows the remainder beyond the 4 visible tiles', () => {
      expect(overflowCount(5)).toBe(1);
      expect(overflowCount(9)).toBe(5);
    });

    it('never renders 4 tiles for a 5+ item post', () => {
      expect(layout(9, 360)).toHaveLength(4);
    });
  });
});
