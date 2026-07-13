/**
 * Token-factory unit tests.
 * Tests for the v2 semantic + component token system.
 */
import {
  koolaColors,
  koolaDarkColors,
  koolaLightSurfaces,
  koolaDarkSurfaces,
  koolaSpacing,
  koolaRadii,
  koolaTypography,
  koolaShadows,
  koolaDarkShadows,
  koolaZIndex,
  koolaOpacity,
  resolveMode,
  normalizeMode,
} from '../theme';
import { makeSemanticTokens } from '../tokens/semantic';
import { makeComponentTokens } from '../tokens/components';

// ─── Helpers ────────────────────────────────────────────────────────────────

const HEX_REGEX = /^#[0-9a-fA-F]{3,8}$/;
const RGBA_REGEX = /^rgba?\(/;

function isColorValue(v: string): boolean {
  return HEX_REGEX.test(v) || RGBA_REGEX.test(v);
}

function isRawHex(v: string): boolean {
  return HEX_REGEX.test(v);
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const srgb = parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

// Collect all leaf string values from a nested object
function collectLeafStrings(obj: Record<string, any>, path = ''): Array<{ path: string; value: string }> {
  const results: Array<{ path: string; value: string }> = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (typeof val === 'string') {
      results.push({ path: fullPath, value: val });
    } else if (typeof val === 'object' && val !== null) {
      results.push(...collectLeafStrings(val, fullPath));
    }
  }
  return results;
}

// ─── Semantic token tests ───────────────────────────────────────────────────

describe('makeSemanticTokens', () => {
  const lightTokens = makeSemanticTokens(koolaColors, koolaLightSurfaces);
  const darkTokens = makeSemanticTokens(koolaDarkColors, koolaDarkSurfaces);

  it('produces all locked semantic keys under LIGHT palette', () => {
    // bg
    expect(lightTokens.bg.canvas).toBeDefined();
    // surface
    expect(lightTokens.surface.level0).toBeDefined();
    expect(lightTokens.surface.level1).toBeDefined();
    expect(lightTokens.surface.level2).toBeDefined();
    expect(lightTokens.surface.overlay).toBeDefined();
    // text
    expect(lightTokens.text.primary).toBeDefined();
    expect(lightTokens.text.muted).toBeDefined();
    expect(lightTokens.text.faint).toBeDefined();
    expect(lightTokens.text.onAction).toBeDefined();
    // action
    expect(lightTokens.action.primary).toBeDefined();
    expect(lightTokens.action.primaryPressed).toBeDefined();
    expect(lightTokens.action.primarySoft).toBeDefined();
    // signal
    expect(lightTokens.signal.selected).toBeDefined();
    expect(lightTokens.signal.unread).toBeDefined();
    // status
    expect(lightTokens.status.success).toBeDefined();
    expect(lightTokens.status.warning).toBeDefined();
    expect(lightTokens.status.danger).toBeDefined();
    // border
    expect(lightTokens.border.subtle).toBeDefined();
    expect(lightTokens.border.strong).toBeDefined();
    // focus
    expect(lightTokens.focus.ring).toBeDefined();
    // link
    expect(lightTokens.link).toBeDefined();
    // brand
    expect(lightTokens.brand.red).toBeDefined();
    expect(lightTokens.brand.blue).toBeDefined();
    expect(lightTokens.brand.green).toBeDefined();
  });

  it('produces all locked semantic keys under DARK palette', () => {
    expect(darkTokens.bg.canvas).toBeDefined();
    expect(darkTokens.surface.level0).toBeDefined();
    expect(darkTokens.surface.level1).toBeDefined();
    expect(darkTokens.surface.level2).toBeDefined();
    expect(darkTokens.surface.overlay).toBeDefined();
    expect(darkTokens.text.primary).toBeDefined();
    expect(darkTokens.text.muted).toBeDefined();
    expect(darkTokens.text.faint).toBeDefined();
    expect(darkTokens.text.onAction).toBeDefined();
    expect(darkTokens.action.primary).toBeDefined();
    expect(darkTokens.action.primaryPressed).toBeDefined();
    expect(darkTokens.action.primarySoft).toBeDefined();
    expect(darkTokens.signal.selected).toBeDefined();
    expect(darkTokens.signal.unread).toBeDefined();
    expect(darkTokens.status.success).toBeDefined();
    expect(darkTokens.status.warning).toBeDefined();
    expect(darkTokens.status.danger).toBeDefined();
    expect(darkTokens.border.subtle).toBeDefined();
    expect(darkTokens.border.strong).toBeDefined();
    expect(darkTokens.focus.ring).toBeDefined();
    expect(darkTokens.link).toBeDefined();
    expect(darkTokens.brand.red).toBeDefined();
    expect(darkTokens.brand.blue).toBeDefined();
    expect(darkTokens.brand.green).toBeDefined();
  });

  it('is pure and deterministic', () => {
    const a = makeSemanticTokens(koolaColors, koolaLightSurfaces);
    const b = makeSemanticTokens(koolaColors, koolaLightSurfaces);
    expect(a).toEqual(b);

    const c = makeSemanticTokens(koolaDarkColors, koolaDarkSurfaces);
    const d = makeSemanticTokens(koolaDarkColors, koolaDarkSurfaces);
    expect(c).toEqual(d);
  });

  it('light and dark tokens differ (different inputs produce different outputs)', () => {
    expect(lightTokens).not.toEqual(darkTokens);
  });

  it('all leaf values are valid color strings', () => {
    const lightLeaves = collectLeafStrings(lightTokens as any);
    for (const { path: _path, value } of lightLeaves) {
      expect(isColorValue(value)).toBe(true);
    }
    const darkLeaves = collectLeafStrings(darkTokens as any);
    for (const { path: _path, value } of darkLeaves) {
      expect(isColorValue(value)).toBe(true);
    }
  });

  it('surface levels are distinct in light palette', () => {
    const { level0, level1, level2, overlay } = lightTokens.surface;
    const values = [level0, level1, level2, overlay];
    const unique = new Set(values);
    expect(unique.size).toBe(4);
  });

  it('surface levels are distinct in dark palette', () => {
    const { level0, level1, level2, overlay } = darkTokens.surface;
    const values = [level0, level1, level2, overlay];
    const unique = new Set(values);
    expect(unique.size).toBe(4);
  });

  it('surface levels are contrast-ordered (dark: level0 < level1 < level2 get progressively lighter)', () => {
    const { level0, level1, level2 } = darkTokens.surface;
    if (isRawHex(level0) && isRawHex(level1) && isRawHex(level2)) {
      expect(relativeLuminance(level1)).toBeGreaterThan(relativeLuminance(level0));
      expect(relativeLuminance(level2)).toBeGreaterThan(relativeLuminance(level1));
    }
  });
});

// ─── Component token tests ──────────────────────────────────────────────────

describe('makeComponentTokens', () => {
  const semanticLight = makeSemanticTokens(koolaColors, koolaLightSurfaces);
  const semanticDark = makeSemanticTokens(koolaDarkColors, koolaDarkSurfaces);
  const componentLight = makeComponentTokens(semanticLight);
  const _componentDark = makeComponentTokens(semanticDark);

  it('is pure and deterministic', () => {
    const a = makeComponentTokens(semanticLight);
    const b = makeComponentTokens(semanticLight);
    expect(a).toEqual(b);
  });

  it('component color tokens contain no raw hex outside token definitions', () => {
    // Component tokens should compose from semantic tokens, which are palette
    // references. The component token values should be the SAME values that
    // appear in the semantic tokens (not new hex literals invented here).
    const semanticLeaves = collectLeafStrings(semanticLight as any);
    const semanticValues = new Set(semanticLeaves.map(l => l.value));

    const componentLeaves = collectLeafStrings(componentLight as any);
    for (const { path: _path, value } of componentLeaves) {
      // Every component color value must exist in the semantic token set
      expect(semanticValues.has(value)).toBe(true);
    }
  });

  it('produces all expected component token keys', () => {
    // chatBubble
    expect(componentLight.chatBubble.own.bg).toBeDefined();
    expect(componentLight.chatBubble.own.text).toBeDefined();
    expect(componentLight.chatBubble.other.bg).toBeDefined();
    expect(componentLight.chatBubble.other.text).toBeDefined();
    // tab
    expect(componentLight.tab.active).toBeDefined();
    expect(componentLight.tab.inactive).toBeDefined();
    expect(componentLight.tab.dock).toBeDefined();
    expect(componentLight.tab.dock.fill).toBeDefined();
    expect(componentLight.tab.dock.tint).toBeDefined();
    expect(componentLight.tab.dock.sheen).toBeDefined();
    expect(componentLight.tab.dock.hairline).toBeDefined();
    expect(componentLight.tab.dock.bottomLine).toBeDefined();
    // composer
    expect(componentLight.composer.surface.fill).toBeDefined();
    expect(componentLight.composer.surface.tint).toBeDefined();
    expect(componentLight.composer.surface.sheen).toBeDefined();
    expect(componentLight.composer.surface.hairline).toBeDefined();
    expect(componentLight.composer.surface.bottomLine).toBeDefined();
    // sheet
    expect(componentLight.sheet.surface.fill).toBeDefined();
    expect(componentLight.sheet.surface.tint).toBeDefined();
    expect(componentLight.sheet.surface.sheen).toBeDefined();
    expect(componentLight.sheet.surface.hairline).toBeDefined();
    expect(componentLight.sheet.surface.bottomLine).toBeDefined();
  });

  it('chatBubble tokens use no glass treatment (opaque colors only)', () => {
    // chatBubble is a content surface — must not have GlassSurface shape
    const own = componentLight.chatBubble.own;
    const other = componentLight.chatBubble.other;
    // These should be simple string values, not objects with glass properties
    expect(typeof own.bg).toBe('string');
    expect(typeof own.text).toBe('string');
    expect(typeof other.bg).toBe('string');
    expect(typeof other.text).toBe('string');
    // No rgba (translucent) on content surfaces
    expect(own.bg).not.toMatch(RGBA_REGEX);
    expect(other.bg).not.toMatch(RGBA_REGEX);
  });
});

// ─── Existing exports unchanged ─────────────────────────────────────────────

describe('existing theme exports byte-for-byte', () => {
  it('resolveMode is unchanged', () => {
    expect(resolveMode('light', 'dark')).toBe('light');
    expect(resolveMode('dark', 'light')).toBe('dark');
    expect(resolveMode('system', 'dark')).toBe('dark');
    expect(resolveMode('system', 'light')).toBe('light');
    expect(resolveMode('system', null)).toBe('light');
  });

  it('normalizeMode is unchanged', () => {
    expect(normalizeMode('light')).toBe('light');
    expect(normalizeMode('dark')).toBe('dark');
    expect(normalizeMode('system')).toBe('system');
    expect(normalizeMode(null)).toBe('system');
    expect(normalizeMode('invalid')).toBe('system');
  });

  it('koolaColors values are unchanged', () => {
    expect(koolaColors.ink).toBe('#101828');
    expect(koolaColors.canvas).toBe('#F7F9FC');
    expect(koolaColors.surface).toBe('#FFFFFF');
    expect(koolaColors.primary).toBe('#2563EB');
    expect(koolaColors.brandRed).toBe('#E12D24');
    expect(koolaColors.brandBlue).toBe('#1E50C8');
    expect(koolaColors.brandGreen).toBe('#1FA64A');
  });

  it('koolaDarkColors values are unchanged', () => {
    expect(koolaDarkColors.ink).toBe('#F2F4F7');
    expect(koolaDarkColors.canvas).toBe('#0F1419');
    expect(koolaDarkColors.surface).toBe('#1C2026');
    expect(koolaDarkColors.primary).toBe('#4D8DF7');
  });

  it('koolaSpacing values are unchanged', () => {
    expect(koolaSpacing.xs).toBe(4);
    expect(koolaSpacing.sm).toBe(8);
    expect(koolaSpacing.md).toBe(12);
    expect(koolaSpacing.lg).toBe(16);
    expect(koolaSpacing.xl).toBe(24);
    expect(koolaSpacing.xxl).toBe(32);
  });

  it('koolaRadii values are unchanged', () => {
    expect(koolaRadii.xs).toBe(8);
    expect(koolaRadii.sm).toBe(10);
    expect(koolaRadii.md).toBe(14);
    expect(koolaRadii.lg).toBe(20);
    expect(koolaRadii.pill).toBe(999);
  });

  it('koolaTypography values are unchanged', () => {
    expect(koolaTypography.body.fontSize).toBe(15);
    expect(koolaTypography.title.fontSize).toBe(24);
    expect(koolaTypography.display.fontSize).toBe(32);
  });

  it('koolaShadows structure is unchanged', () => {
    expect(koolaShadows.xs.shadowOffset.height).toBe(1);
    expect(koolaShadows.md.shadowOpacity).toBe(0.08);
    expect(koolaShadows.xl.elevation).toBe(8);
  });

  it('koolaDarkShadows structure is unchanged', () => {
    expect(koolaDarkShadows.xs.backgroundColor).toBe('#1F252B');
    expect(koolaDarkShadows.md.borderTopColor).toBe('rgba(255,255,255,0.06)');
  });

  it('koolaZIndex values are unchanged', () => {
    expect(koolaZIndex.hide).toBe(-1);
    expect(koolaZIndex.base).toBe(0);
    expect(koolaZIndex.toast).toBe(50);
  });

  it('koolaOpacity values are unchanged', () => {
    expect(koolaOpacity.disabled).toBe(0.4);
    expect(koolaOpacity.pressed).toBe(0.7);
  });
});
