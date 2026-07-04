import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';

/**
 * KOOLA brand mark — a geometric distillation of the original three-color
 * swirl into a balanced tri-arc ring (red / blue / green). Flat, no gradients,
 * round-capped strokes. Stays crisp and recognizable from 24px up, so it works
 * standalone as an app icon / favicon as well as inside the header lockup.
 *
 * Geometry: 48×48 viewBox, ring r=17 about (24,24), three equal 90° arcs with
 * even 30° gaps; round caps visually widen each arc to ~110° and tighten the
 * gaps to ~10°. Source SVG mirrored at assets/brand/koola-mark.svg.
 */

interface KoolaMarkProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export const KoolaMark: React.FC<KoolaMarkProps> = ({ size = 28, style }) => {
  const { palette } = useTheme();
  // strokeWidth scales with the mark so the ring weight stays proportional.
  const stroke = (size / 48) * 6;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" style={style}>
      {/* top-right arc */}
      <Path
        d="M24 7 A17 17 0 0 1 41 24"
        stroke={palette.brandRed}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
      {/* bottom arc */}
      <Path
        d="M38.72 32.5 A17 17 0 0 1 15.5 38.72"
        stroke={palette.brandBlue}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
      {/* left arc */}
      <Path
        d="M9.28 32.5 A17 17 0 0 1 15.5 9.28"
        stroke={palette.brandGreen}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
};

// ─── Variant types ───────────────────────────────────────────────────────────

export type KoolaLogoVariant = 'flat' | 'extruded' | 'tilt' | 'hero' | 'outline' | 'bevel' | 'longshadow' | 'sticker' | 'mono' | 'underline';

export type KoolaLogoFont = 'system' | 'montserrat' | 'poppins' | 'nunito' | 'sora' | 'rubik' | 'outfit' | 'baloo2' | 'righteous' | 'archivoblack';

export type KoolaLogoAnimation = 'none' | 'stagger-rise' | 'stagger-drop' | 'stagger-pop' | 'fade-slide';

/** Maps font option to the Android fontFamily name (filename without .ttf). */
const FONT_FAMILY_MAP: Record<KoolaLogoFont, string | undefined> = {
  system: undefined,
  montserrat: 'Montserrat-ExtraBold',
  poppins: 'Poppins-ExtraBold',
  nunito: 'Nunito-ExtraBold',
  sora: 'Sora-ExtraBold',
  rubik: 'Rubik-ExtraBold',
  outfit: 'Outfit-ExtraBold',
  baloo2: 'Baloo2-ExtraBold',
  righteous: 'Righteous-Regular',
  archivoblack: 'ArchivoBlack-Regular',
};

interface KoolaLogoProps {
  /** Pixel size of the mark glyph. */
  markSize?: number;
  /** Render the geometric tri-arc mark beside the wordmark. */
  showMark?: boolean;
  /** Render the KOOLA wordmark beside the mark. */
  showWordmark?: boolean;
  /** Visual style variant (default: 'flat' — identical to original). */
  variant?: KoolaLogoVariant;
  /** Typeface for the wordmark letters (default: 'system' — unchanged). */
  font?: KoolaLogoFont;
  /**
   * Override the wordmark text fontSize.
   * When omitted, the wordmark uses variant="heading" (~20px) exactly as before.
   * When provided, fontSize + lineHeight (fontSize * 1.2) are applied via style.
   */
  wordmarkSize?: number;
  /** Entrance animation (default 'none' — static). One-shot on mount. */
  animation?: KoolaLogoAnimation;
  style?: StyleProp<ViewStyle>;
}

// ─── darkenHex helper ────────────────────────────────────────────────────────
// Derives a darker shade from a hex color token by blending toward black.
// factor: 0 = unchanged, 1 = pure black.

function darkenHex(hex: string, factor: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const dr = Math.round(r * (1 - factor));
  const dg = Math.round(g * (1 - factor));
  const db = Math.round(b * (1 - factor));
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
}

// ─── lightenHex helper ──────────────────────────────────────────────────────
// Derives a lighter shade from a hex color token by blending toward white.
// factor: 0 = unchanged, 1 = pure white.

function lightenHex(hex: string, factor: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const lr = Math.round(r + (255 - r) * factor);
  const lg = Math.round(g + (255 - g) * factor);
  const lb = Math.round(b + (255 - b) * factor);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

// ─── Flat wordmark (shared, exactly as original) ─────────────────────────────

interface FlatWordmarkProps {
  solo: boolean;
  brandRed: string;
  brandBlue: string;
  brandGreen: string;
  fontFamily?: string;
  /** Override fontSize for the wordmark text. */
  wordmarkSize?: number;
}

const FlatWordmark: React.FC<FlatWordmarkProps> = ({ solo, brandRed, brandBlue, brandGreen, fontFamily, wordmarkSize }) => {
  // When a custom fontFamily is set (e.g. 'Montserrat-ExtraBold'), the TTF
  // itself carries the weight. Combining ANY numeric fontWeight with the named
  // file makes Android fail lookup and fall back to the system font. Two
  // sources of numeric weight must be neutralised:
  //   1. the `weight` prop (was '800') — dropped below, and
  //   2. koolaTypography.heading, which injects fontWeight:'700'.
  // We override fontWeight:'normal' in the style (style wins over variant) so
  // Android resolves the ExtraBold TTF directly. System path keeps weight 800.
  const weight = fontFamily ? undefined : '800' as const;
  const fontStyle = fontFamily
    ? { fontFamily, fontWeight: 'normal' as const }
    : undefined;

  // When wordmarkSize is provided, override fontSize + lineHeight via style.
  // lineHeight = fontSize * 1.2 prevents clipping on tall glyphs.
  const sizeStyle = wordmarkSize
    ? { fontSize: wordmarkSize, lineHeight: Math.round(wordmarkSize * 1.2) }
    : undefined;

  return (
    <KoolaText variant="heading" weight={weight} style={[solo ? styles.wordmarkSolo : styles.wordmark, sizeStyle, fontStyle]}>
      <KoolaText variant="heading" weight={weight} style={[{ color: brandRed }, sizeStyle, fontStyle]}>K</KoolaText>
      <KoolaText variant="heading" weight={weight} style={[{ color: brandBlue }, sizeStyle, fontStyle]}>OOL</KoolaText>
      <KoolaText variant="heading" weight={weight} style={[{ color: brandGreen }, sizeStyle, fontStyle]}>A</KoolaText>
    </KoolaText>
  );
};

// ─── Extruded wordmark ───────────────────────────────────────────────────────
// Multiple offset layers behind the top face for a faux-3D block look.
// Depth scales with fontSize so the block reads correctly at 24px AND 60px.

/**
 * Compute extrusion parameters scaled to the rendered font size.
 * Total depth ≈ fontSize * 0.12, distributed over fewer layers for a thinner,
 * cleaner letterpress look.
 * E.g. 20px → ~2px depth / 6 layers; 60px → ~7px depth / 9 layers.
 */
function getExtrudeParams(fontSize: number) {
  const totalDepth = Math.round(fontSize * 0.12);
  // Fewer layers for a tighter stack; capped so perf stays fine.
  const layerCount = Math.max(6, Math.min(10, Math.round(totalDepth * 1.2)));
  const step = totalDepth / layerCount;
  return { totalDepth, layerCount, step };
}

/** Default heading fontSize when wordmarkSize is not set (~20px from variant="heading"). */
const DEFAULT_HEADING_SIZE = 20;

interface ExtrudedWordmarkProps {
  solo: boolean;
  brandRed: string;
  brandBlue: string;
  brandGreen: string;
  fontFamily?: string;
  /** Override fontSize for the wordmark text (layers + top face). */
  wordmarkSize?: number;
}

const ExtrudedWordmark: React.FC<ExtrudedWordmarkProps> = ({ solo, brandRed, brandBlue, brandGreen, fontFamily, wordmarkSize }) => {
  // Same weight logic as FlatWordmark: drop numeric fontWeight for custom fonts
  // AND override fontWeight:'normal' to neutralise koolaTypography.heading's 700.
  const weight = fontFamily ? undefined : '800' as const;
  const fontStyle = fontFamily
    ? { fontFamily, fontWeight: 'normal' as const }
    : undefined;
  const sizeStyle = wordmarkSize
    ? { fontSize: wordmarkSize, lineHeight: Math.round(wordmarkSize * 1.2) }
    : undefined;

  const effectiveSize = wordmarkSize ?? DEFAULT_HEADING_SIZE;
  const { layerCount, step } = getExtrudeParams(effectiveSize);
  // Total pixel offset consumed by all layers (for container padding).
  const totalOffset = Math.ceil(layerCount * step);

  // Build layers from back (darkest) to front (brand colors).
  // Offset direction: straight down (letterpress style — top increases, left stays 0).
  // Darkness ramp: deepest layer = 50% darker, nearest = 15% darker.
  const layers: React.ReactNode[] = [];
  for (let i = layerCount; i >= 1; i--) {
    const t = i / layerCount; // 1 = deepest, approaches 0 = nearest to top
    const factor = 0.15 + t * 0.35; // ramp from 15% → 50%
    const dRed = darkenHex(brandRed, factor);
    const dBlue = darkenHex(brandBlue, factor);
    const dGreen = darkenHex(brandGreen, factor);
    const offset = Math.round(i * step);
    layers.push(
      <View
        key={`extrude-${i}`}
        style={[StyleSheet.absoluteFill, { top: offset, left: 0 }]}
        pointerEvents="none"
      >
        <KoolaText variant="heading" weight={weight} style={[solo ? styles.wordmarkSolo : styles.wordmark, sizeStyle, fontStyle]}>
          <KoolaText variant="heading" weight={weight} style={[{ color: dRed }, sizeStyle, fontStyle]}>K</KoolaText>
          <KoolaText variant="heading" weight={weight} style={[{ color: dBlue }, sizeStyle, fontStyle]}>OOL</KoolaText>
          <KoolaText variant="heading" weight={weight} style={[{ color: dGreen }, sizeStyle, fontStyle]}>A</KoolaText>
        </KoolaText>
      </View>,
    );
  }
  // Top face — exact brand colors, same size so layers align
  layers.push(
    <FlatWordmark key="extrude-top" solo={solo} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} />,
  );
  return (
    <View style={{ position: 'relative', paddingBottom: totalOffset }}>
      {layers}
    </View>
  );
};

// ─── Mono wordmark ──────────────────────────────────────────────────────────
// Single-ink version — all letters share one color. Useful for monotone contexts.

interface MonoWordmarkProps {
  solo: boolean;
  brandRed: string;
  brandBlue: string;
  brandGreen: string;
  fontFamily?: string;
  wordmarkSize?: number;
  ink: string;
}

const MonoWordmark: React.FC<MonoWordmarkProps> = ({ solo, ink, fontFamily, wordmarkSize }) => {
  const weight = fontFamily ? undefined : '800' as const;
  const fontStyle = fontFamily
    ? { fontFamily, fontWeight: 'normal' as const }
    : undefined;
  const sizeStyle = wordmarkSize
    ? { fontSize: wordmarkSize, lineHeight: Math.round(wordmarkSize * 1.2) }
    : undefined;

  return (
    <KoolaText variant="heading" weight={weight} style={[solo ? styles.wordmarkSolo : styles.wordmark, sizeStyle, fontStyle]}>
      <KoolaText variant="heading" weight={weight} style={[{ color: ink }, sizeStyle, fontStyle]}>K</KoolaText>
      <KoolaText variant="heading" weight={weight} style={[{ color: ink }, sizeStyle, fontStyle]}>OOL</KoolaText>
      <KoolaText variant="heading" weight={weight} style={[{ color: ink }, sizeStyle, fontStyle]}>A</KoolaText>
    </KoolaText>
  );
};

// ─── Underline wordmark ─────────────────────────────────────────────────────
// Flat tricolor text with a tricolor underline bar beneath.

interface UnderlineWordmarkProps {
  solo: boolean;
  brandRed: string;
  brandBlue: string;
  brandGreen: string;
  fontFamily?: string;
  wordmarkSize?: number;
}

const UnderlineWordmark: React.FC<UnderlineWordmarkProps> = ({ solo, brandRed, brandBlue, brandGreen, fontFamily, wordmarkSize }) => {
  const weight = fontFamily ? undefined : '800' as const;
  const fontStyle = fontFamily
    ? { fontFamily, fontWeight: 'normal' as const }
    : undefined;
  const sizeStyle = wordmarkSize
    ? { fontSize: wordmarkSize, lineHeight: Math.round(wordmarkSize * 1.2) }
    : undefined;

  const effectiveSize = wordmarkSize ?? DEFAULT_HEADING_SIZE;
  const barHeight = Math.max(2, Math.round(effectiveSize * 0.12));
  const barMarginTop = Math.round(effectiveSize * 0.12);

  return (
    <View style={{ alignItems: solo ? 'center' as const : 'flex-start' as const }}>
      <KoolaText variant="heading" weight={weight} style={[solo ? styles.wordmarkSolo : styles.wordmark, sizeStyle, fontStyle]}>
        <KoolaText variant="heading" weight={weight} style={[{ color: brandRed }, sizeStyle, fontStyle]}>K</KoolaText>
        <KoolaText variant="heading" weight={weight} style={[{ color: brandBlue }, sizeStyle, fontStyle]}>OOL</KoolaText>
        <KoolaText variant="heading" weight={weight} style={[{ color: brandGreen }, sizeStyle, fontStyle]}>A</KoolaText>
      </KoolaText>
      <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginTop: barMarginTop }}>
        <View style={{ flex: 1, height: barHeight, backgroundColor: brandRed, borderRadius: 2 }} />
        <View style={{ flex: 1, height: barHeight, backgroundColor: brandBlue, borderRadius: 2, marginLeft: 1 }} />
        <View style={{ flex: 1, height: barHeight, backgroundColor: brandGreen, borderRadius: 2, marginLeft: 1 }} />
      </View>
    </View>
  );
};

// ─── Outline wordmark ───────────────────────────────────────────────────────
// Faux hollow letters: 8 offset copies form the outline, top face fills with surface color.

interface OutlineWordmarkProps {
  solo: boolean;
  brandRed: string;
  brandBlue: string;
  brandGreen: string;
  fontFamily?: string;
  wordmarkSize?: number;
  fill: string;
}

const OutlineWordmark: React.FC<OutlineWordmarkProps> = ({ solo, brandRed, brandBlue, brandGreen, fontFamily, wordmarkSize, fill }) => {
  const weight = fontFamily ? undefined : '800' as const;
  const fontStyle = fontFamily
    ? { fontFamily, fontWeight: 'normal' as const }
    : undefined;
  const sizeStyle = wordmarkSize
    ? { fontSize: wordmarkSize, lineHeight: Math.round(wordmarkSize * 1.2) }
    : undefined;

  const effectiveSize = wordmarkSize ?? DEFAULT_HEADING_SIZE;
  const o = Math.max(1, Math.round(effectiveSize * 0.045));

  const DIRECTIONS = [
    { top: -o, left: 0 }, { top: o, left: 0 },
    { top: 0, left: -o }, { top: 0, left: o },
    { top: -o, left: -o }, { top: -o, left: o },
    { top: o, left: -o }, { top: o, left: o },
  ];

  const layers: React.ReactNode[] = [];
  DIRECTIONS.forEach((dir, idx) => {
    layers.push(
      <View
        key={`outline-${idx}`}
        style={[StyleSheet.absoluteFill, { top: dir.top + o, left: dir.left + o }]}
        pointerEvents="none"
      >
        <KoolaText variant="heading" weight={weight} style={[solo ? styles.wordmarkSolo : styles.wordmark, sizeStyle, fontStyle]}>
          <KoolaText variant="heading" weight={weight} style={[{ color: brandRed }, sizeStyle, fontStyle]}>K</KoolaText>
          <KoolaText variant="heading" weight={weight} style={[{ color: brandBlue }, sizeStyle, fontStyle]}>OOL</KoolaText>
          <KoolaText variant="heading" weight={weight} style={[{ color: brandGreen }, sizeStyle, fontStyle]}>A</KoolaText>
        </KoolaText>
      </View>,
    );
  });

  // Top face — fill color (reads as hollow)
  layers.push(
    <KoolaText key="outline-top" variant="heading" weight={weight} style={[solo ? styles.wordmarkSolo : styles.wordmark, sizeStyle, fontStyle, { position: 'relative' as const }]}>
      <KoolaText variant="heading" weight={weight} style={[{ color: fill }, sizeStyle, fontStyle]}>K</KoolaText>
      <KoolaText variant="heading" weight={weight} style={[{ color: fill }, sizeStyle, fontStyle]}>OOL</KoolaText>
      <KoolaText variant="heading" weight={weight} style={[{ color: fill }, sizeStyle, fontStyle]}>A</KoolaText>
    </KoolaText>,
  );

  return (
    <View style={{ position: 'relative', padding: o }}>
      {layers}
    </View>
  );
};

// ─── Bevel wordmark ─────────────────────────────────────────────────────────
// Emboss effect: lightened top-left highlight, darkened bottom-right shadow, brand top face.

interface BevelWordmarkProps {
  solo: boolean;
  brandRed: string;
  brandBlue: string;
  brandGreen: string;
  fontFamily?: string;
  wordmarkSize?: number;
}

const BevelWordmark: React.FC<BevelWordmarkProps> = ({ solo, brandRed, brandBlue, brandGreen, fontFamily, wordmarkSize }) => {
  const weight = fontFamily ? undefined : '800' as const;
  const fontStyle = fontFamily
    ? { fontFamily, fontWeight: 'normal' as const }
    : undefined;
  const sizeStyle = wordmarkSize
    ? { fontSize: wordmarkSize, lineHeight: Math.round(wordmarkSize * 1.2) }
    : undefined;

  const effectiveSize = wordmarkSize ?? DEFAULT_HEADING_SIZE;
  const o = Math.max(1, Math.round(effectiveSize * 0.05));

  return (
    <View style={{ position: 'relative', padding: o }}>
      {/* Highlight layer — lightened, offset top-left */}
      <View
        style={[StyleSheet.absoluteFill, { top: 0, left: 0 }]}
        pointerEvents="none"
      >
        <KoolaText variant="heading" weight={weight} style={[solo ? styles.wordmarkSolo : styles.wordmark, sizeStyle, fontStyle]}>
          <KoolaText variant="heading" weight={weight} style={[{ color: lightenHex(brandRed, 0.5) }, sizeStyle, fontStyle]}>K</KoolaText>
          <KoolaText variant="heading" weight={weight} style={[{ color: lightenHex(brandBlue, 0.5) }, sizeStyle, fontStyle]}>OOL</KoolaText>
          <KoolaText variant="heading" weight={weight} style={[{ color: lightenHex(brandGreen, 0.5) }, sizeStyle, fontStyle]}>A</KoolaText>
        </KoolaText>
      </View>
      {/* Shadow layer — darkened, offset bottom-right */}
      <View
        style={[StyleSheet.absoluteFill, { top: o * 2, left: o * 2 }]}
        pointerEvents="none"
      >
        <KoolaText variant="heading" weight={weight} style={[solo ? styles.wordmarkSolo : styles.wordmark, sizeStyle, fontStyle]}>
          <KoolaText variant="heading" weight={weight} style={[{ color: darkenHex(brandRed, 0.5) }, sizeStyle, fontStyle]}>K</KoolaText>
          <KoolaText variant="heading" weight={weight} style={[{ color: darkenHex(brandBlue, 0.5) }, sizeStyle, fontStyle]}>OOL</KoolaText>
          <KoolaText variant="heading" weight={weight} style={[{ color: darkenHex(brandGreen, 0.5) }, sizeStyle, fontStyle]}>A</KoolaText>
        </KoolaText>
      </View>
      {/* Top face — brand colors at center */}
      <KoolaText variant="heading" weight={weight} style={[solo ? styles.wordmarkSolo : styles.wordmark, sizeStyle, fontStyle]}>
        <KoolaText variant="heading" weight={weight} style={[{ color: brandRed }, sizeStyle, fontStyle]}>K</KoolaText>
        <KoolaText variant="heading" weight={weight} style={[{ color: brandBlue }, sizeStyle, fontStyle]}>OOL</KoolaText>
        <KoolaText variant="heading" weight={weight} style={[{ color: brandGreen }, sizeStyle, fontStyle]}>A</KoolaText>
      </KoolaText>
    </View>
  );
};

// ─── Long-shadow wordmark ───────────────────────────────────────────────────
// Flat-design 45-degree long shadow behind brand-color top face.

interface LongShadowWordmarkProps {
  solo: boolean;
  brandRed: string;
  brandBlue: string;
  brandGreen: string;
  fontFamily?: string;
  wordmarkSize?: number;
}

const LongShadowWordmark: React.FC<LongShadowWordmarkProps> = ({ solo, brandRed, brandBlue, brandGreen, fontFamily, wordmarkSize }) => {
  const weight = fontFamily ? undefined : '800' as const;
  const fontStyle = fontFamily
    ? { fontFamily, fontWeight: 'normal' as const }
    : undefined;
  const sizeStyle = wordmarkSize
    ? { fontSize: wordmarkSize, lineHeight: Math.round(wordmarkSize * 1.2) }
    : undefined;

  const effectiveSize = wordmarkSize ?? DEFAULT_HEADING_SIZE;
  const N = Math.min(18, Math.max(8, Math.round(effectiveSize * 0.7)));

  const shadowRed = darkenHex(brandRed, 0.45);
  const shadowBlue = darkenHex(brandBlue, 0.45);
  const shadowGreen = darkenHex(brandGreen, 0.45);

  const layers: React.ReactNode[] = [];
  // Render deepest (largest offset) first, shallowest last
  for (let i = N; i >= 1; i--) {
    layers.push(
      <View
        key={`lshadow-${i}`}
        style={[StyleSheet.absoluteFill, { top: i, left: i }]}
        pointerEvents="none"
      >
        <KoolaText variant="heading" weight={weight} style={[solo ? styles.wordmarkSolo : styles.wordmark, sizeStyle, fontStyle]}>
          <KoolaText variant="heading" weight={weight} style={[{ color: shadowRed }, sizeStyle, fontStyle]}>K</KoolaText>
          <KoolaText variant="heading" weight={weight} style={[{ color: shadowBlue }, sizeStyle, fontStyle]}>OOL</KoolaText>
          <KoolaText variant="heading" weight={weight} style={[{ color: shadowGreen }, sizeStyle, fontStyle]}>A</KoolaText>
        </KoolaText>
      </View>,
    );
  }
  // Top face — brand colors at origin
  layers.push(
    <FlatWordmark key="lshadow-top" solo={solo} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} />,
  );

  return (
    <View style={{ position: 'relative', paddingBottom: N, paddingRight: N }}>
      {layers}
    </View>
  );
};

// ─── Sticker wordmark ───────────────────────────────────────────────────────
// Solid ink backing plate offset down-right, brand-color top face above.

// ─── Animation helpers ─────────────────────────────────────────────────────────
// Shared segment model for stagger animations.

const WORDMARK_SEGMENTS = [
  { key: 'k', text: 'K', colorKey: 'brandRed' },
  { key: 'ool', text: 'OOL', colorKey: 'brandBlue' },
  { key: 'a', text: 'A', colorKey: 'brandGreen' },
] as const;

// ─── ExtrudedSegment ────────────────────────────────────────────────────────
// Renders a single 3D-block segment (one color group) for stagger animations.

interface ExtrudedSegmentProps {
  text: string;
  color: string;
  fontFamily?: string;
  wordmarkSize?: number;
}

const ExtrudedSegment: React.FC<ExtrudedSegmentProps> = ({ text, color, fontFamily, wordmarkSize }) => {
  const weight = fontFamily ? undefined : '800' as const;
  const fontStyle = fontFamily
    ? { fontFamily, fontWeight: 'normal' as const }
    : undefined;
  const effectiveSize = wordmarkSize ?? DEFAULT_HEADING_SIZE;
  const sizeStyle = wordmarkSize
    ? { fontSize: wordmarkSize, lineHeight: Math.round(wordmarkSize * 1.2) }
    : undefined;
  const { layerCount, step } = getExtrudeParams(effectiveSize);
  const totalOffset = Math.ceil(layerCount * step);

  const layers: React.ReactNode[] = [];
  for (let i = layerCount; i >= 1; i--) {
    const t = i / layerCount;
    const factor = 0.15 + t * 0.35;
    const darkColor = darkenHex(color, factor);
    const offset = Math.round(i * step);
    layers.push(
      <View
        key={`seg-extrude-${i}`}
        style={[StyleSheet.absoluteFill, { top: offset, left: 0 }]}
        pointerEvents="none"
      >
        <KoolaText variant="heading" weight={weight} style={[styles.segmentText, sizeStyle, fontStyle, { color: darkColor }]}>
          {text}
        </KoolaText>
      </View>,
    );
  }
  // Top face
  layers.push(
    <KoolaText key="seg-top" variant="heading" weight={weight} style={[styles.segmentText, sizeStyle, fontStyle, { color }]}>
      {text}
    </KoolaText>,
  );

  return (
    <View style={{ position: 'relative', paddingBottom: totalOffset }}>
      {layers}
    </View>
  );
};

// ─── StaggerSegment ─────────────────────────────────────────────────────────
// Per-segment animated wrapper. Owns its own shared values (hooks-safe).

interface StaggerSegmentProps {
  index: number;
  mode: 'rise' | 'drop' | 'pop';
  text: string;
  color: string;
  fontFamily?: string;
  wordmarkSize?: number;
}

const StaggerSegment: React.FC<StaggerSegmentProps> = ({ index, mode, text, color, fontFamily, wordmarkSize }) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(mode === 'rise' ? 14 : mode === 'drop' ? -14 : 0);
  const scale = useSharedValue(mode === 'pop' ? 0.5 : 1);

  useEffect(() => {
    const delay = index * 130;
    const timingConfig = { duration: 480, easing: Easing.out(Easing.cubic) };
    opacity.value = withDelay(delay, withTiming(1, timingConfig));
    if (mode === 'rise' || mode === 'drop') {
      translateY.value = withDelay(delay, withTiming(0, timingConfig));
    } else {
      scale.value = withDelay(delay, withTiming(1, timingConfig));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => {
    if (mode === 'pop') {
      return { opacity: opacity.value, transform: [{ scale: scale.value }] };
    }
    return { opacity: opacity.value, transform: [{ translateY: translateY.value }] };
  });

  return (
    <Animated.View style={animStyle}>
      <ExtrudedSegment text={text} color={color} fontFamily={fontFamily} wordmarkSize={wordmarkSize} />
    </Animated.View>
  );
};

// ─── StaggerWordmark ────────────────────────────────────────────────────────
// Renders 3 extruded segments in a row with staggered entrance animation.

interface StaggerWordmarkProps {
  mode: 'rise' | 'drop' | 'pop';
  brandRed: string;
  brandBlue: string;
  brandGreen: string;
  fontFamily?: string;
  wordmarkSize?: number;
}

const StaggerWordmark: React.FC<StaggerWordmarkProps> = ({ mode, brandRed, brandBlue, brandGreen, fontFamily, wordmarkSize }) => {
  const colorMap = { brandRed, brandBlue, brandGreen };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {WORDMARK_SEGMENTS.map((seg, idx) => (
        <StaggerSegment
          key={seg.key}
          index={idx}
          mode={mode}
          text={seg.text}
          color={colorMap[seg.colorKey]}
          fontFamily={fontFamily}
          wordmarkSize={wordmarkSize}
        />
      ))}
    </View>
  );
};

// ─── FadeSlide wrapper ──────────────────────────────────────────────────────
// Wraps children with a one-shot fade+slide-in-from-left animation.

interface FadeSlideProps {
  children: React.ReactNode;
}

const FadeSlide: React.FC<FadeSlideProps> = ({ children }) => {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-18);

  useEffect(() => {
    const timingConfig = { duration: 420, easing: Easing.out(Easing.cubic) };
    opacity.value = withTiming(1, timingConfig);
    translateX.value = withTiming(0, timingConfig);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      {children}
    </Animated.View>
  );
};

interface StickerWordmarkProps {
  solo: boolean;
  brandRed: string;
  brandBlue: string;
  brandGreen: string;
  fontFamily?: string;
  wordmarkSize?: number;
  ink: string;
}

const StickerWordmark: React.FC<StickerWordmarkProps> = ({ solo, ink, brandRed, brandBlue, brandGreen, fontFamily, wordmarkSize }) => {
  const weight = fontFamily ? undefined : '800' as const;
  const fontStyle = fontFamily
    ? { fontFamily, fontWeight: 'normal' as const }
    : undefined;
  const sizeStyle = wordmarkSize
    ? { fontSize: wordmarkSize, lineHeight: Math.round(wordmarkSize * 1.2) }
    : undefined;

  const effectiveSize = wordmarkSize ?? DEFAULT_HEADING_SIZE;
  const o = Math.max(2, Math.round(effectiveSize * 0.09));

  return (
    <View style={{ position: 'relative', paddingBottom: o, paddingRight: o }}>
      {/* Backing plate — all letters in ink color, offset down-right */}
      <View
        style={[StyleSheet.absoluteFill, { top: o, left: o }]}
        pointerEvents="none"
      >
        <KoolaText variant="heading" weight={weight} style={[solo ? styles.wordmarkSolo : styles.wordmark, sizeStyle, fontStyle]}>
          <KoolaText variant="heading" weight={weight} style={[{ color: ink }, sizeStyle, fontStyle]}>K</KoolaText>
          <KoolaText variant="heading" weight={weight} style={[{ color: ink }, sizeStyle, fontStyle]}>OOL</KoolaText>
          <KoolaText variant="heading" weight={weight} style={[{ color: ink }, sizeStyle, fontStyle]}>A</KoolaText>
        </KoolaText>
      </View>
      {/* Top face — brand colors at origin */}
      <FlatWordmark solo={solo} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} />
    </View>
  );
};

// ─── Tilt wrapper (static perspective tilt + one-shot intro) ─────────────────
// The wordmark RESTS at a fixed angle so it always looks 3D, even when idle.
// On mount, animates from a stronger angle INTO the resting pose (one-shot).

/** Resting tilt angle (degrees). Positive = clockwise about Y axis.
 *  Tune this single constant to adjust how angled the wordmark sits at rest. */
const TILT_REST_Y = 26;
/** Slight forward lean adds depth cue without distorting letter shapes. */
const TILT_REST_X = 12;
/** Starting angle for the one-shot intro (animates toward TILT_REST_Y). */
const TILT_INTRO_Y = 50;

interface TiltWrapperProps {
  children: React.ReactNode;
}

const TiltWrapper: React.FC<TiltWrapperProps> = ({ children }) => {
  const rotateY = useSharedValue(TILT_INTRO_Y);
  const rotateX = useSharedValue(0);

  useEffect(() => {
    rotateY.value = withTiming(TILT_REST_Y, {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });
    rotateX.value = withTiming(TILT_REST_X, {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${rotateY.value}deg` },
      { rotateX: `${rotateX.value}deg` },
    ],
  }));

  return (
    <Animated.View style={animStyle}>
      {children}
    </Animated.View>
  );
};

// ─── Main KoolaLogo component ────────────────────────────────────────────────

export const KoolaLogo: React.FC<KoolaLogoProps> = ({
  markSize = 26,
  showMark = true,
  showWordmark = true,
  variant = 'flat',
  font = 'system',
  wordmarkSize,
  animation = 'none',
  style,
}) => {
  const { palette } = useTheme();

  const renderWordmark = useCallback(() => {
    const solo = !showMark;
    const { brandRed, brandBlue, brandGreen } = palette;
    const fontFamily = FONT_FAMILY_MAP[font];

    // Stagger animations always render extruded segments regardless of variant
    if (animation === 'stagger-rise' || animation === 'stagger-drop' || animation === 'stagger-pop') {
      const mode = animation === 'stagger-rise' ? 'rise' : animation === 'stagger-drop' ? 'drop' : 'pop';
      return <StaggerWordmark mode={mode} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} />;
    }

    let staticNode: React.ReactNode;
    switch (variant) {
      case 'extruded':
        staticNode = <ExtrudedWordmark solo={solo} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} />;
        break;
      case 'tilt':
        staticNode = (
          <TiltWrapper>
            <FlatWordmark solo={solo} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} />
          </TiltWrapper>
        );
        break;
      case 'hero':
        staticNode = (
          <TiltWrapper>
            <ExtrudedWordmark solo={solo} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} />
          </TiltWrapper>
        );
        break;
      case 'mono':
        staticNode = <MonoWordmark solo={solo} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} ink={palette.ink} />;
        break;
      case 'underline':
        staticNode = <UnderlineWordmark solo={solo} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} />;
        break;
      case 'outline':
        staticNode = <OutlineWordmark solo={solo} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} fill={palette.surface} />;
        break;
      case 'bevel':
        staticNode = <BevelWordmark solo={solo} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} />;
        break;
      case 'longshadow':
        staticNode = <LongShadowWordmark solo={solo} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} />;
        break;
      case 'sticker':
        staticNode = <StickerWordmark solo={solo} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} ink={palette.ink} />;
        break;
      case 'flat':
      default:
        staticNode = <FlatWordmark solo={solo} brandRed={brandRed} brandBlue={brandBlue} brandGreen={brandGreen} fontFamily={fontFamily} wordmarkSize={wordmarkSize} />;
        break;
    }

    if (animation === 'fade-slide') {
      return <FadeSlide>{staticNode}</FadeSlide>;
    }

    return staticNode;
  }, [variant, showMark, palette, font, wordmarkSize, animation]);

  return (
    <View style={[styles.row, style]}>
      {showMark ? <KoolaMark size={markSize} /> : null}
      {showWordmark ? renderWordmark() : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordmark: {
    // marginLeft (not gap) — Hermes/RN 0.76 drops row children with gap+flex.
    marginLeft: 7,
    letterSpacing: 1,
  },
  wordmarkSolo: {
    letterSpacing: 2,
    textAlign: 'center',
  },
  segmentText: {
    letterSpacing: 1,
  },
});
