import React, { useEffect, useMemo, useState } from 'react';
import { Image, ImageStyle, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import type { SemanticTokens } from './tokens/semantic';

// ─── Size presets ────────────────────────────────────────────────────────────
const SIZE_PRESETS = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
} as const;

export type AvatarSize = keyof typeof SIZE_PRESETS | number;

// ─── Fallback color palette ─────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#2563EB', '#10B981', '#F97316', '#7C3AED', '#0EA5E9',
  '#EC4899', '#14B8A6', '#F59E0B', '#EF4444', '#84CC16',
  '#6366F1', '#06B6D4',
];

function hashToIndex(str: string, mod: number): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % mod;
}

// ─── Props ───────────────────────────────────────────────────────────────────
export interface KoolaAvatarProps {
  /** Display name for initials fallback + color hashing */
  displayName: string;
  /** Image URI or media key (resolved externally) */
  imageUri?: string | null;
  /** Size preset or numeric px */
  size?: AvatarSize;
  /** Show online indicator dot */
  showOnline?: boolean;
  style?: StyleProp<ViewStyle>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const KoolaAvatar: React.FC<KoolaAvatarProps> = ({
  displayName,
  imageUri,
  size = 'md',
  showOnline = false,
  style,
}) => {
  const { tokens } = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const px = typeof size === 'number' ? size : SIZE_PRESETS[size];
  const radius = px / 2;
  const styles = useMemo(() => makeStyles(tokens.semantic, px), [tokens.semantic, px]);

  const shellStyle: ViewStyle = {
    width: px,
    height: px,
    borderRadius: radius,
  };

  const imageStyle: ImageStyle = {
    width: px,
    height: px,
    borderRadius: radius,
  };

  useEffect(() => {
    setImageFailed(false);
  }, [imageUri]);

  if (imageUri && !imageFailed) {
    return (
      <View
        style={[styles.shell, shellStyle, style]}
        accessibilityRole="image"
        accessibilityLabel={`Ảnh đại diện của ${displayName}${showOnline ? ', đang hoạt động' : ''}`}>
        <Image
          source={{ uri: imageUri }}
          style={[styles.image, imageStyle]}
          onError={() => setImageFailed(true)}
        />
        {showOnline && <View style={styles.onlineDot} importantForAccessibility="no" />}
      </View>
    );
  }

  // Initials fallback
  const initial = displayName?.[0]?.toUpperCase() || '?';
  const colorIndex = displayName
    ? hashToIndex(displayName, AVATAR_COLORS.length)
    : 0;
  const fallbackColor = AVATAR_COLORS[colorIndex];
  const fallbackTextColor = pickReadableColor(
    fallbackColor,
    tokens.semantic.text.primary,
    tokens.semantic.text.onAction,
  );

  return (
    <View
      style={[
        styles.placeholder,
        shellStyle,
        { backgroundColor: fallbackColor },
        style,
      ]}
      accessibilityRole="image"
      accessibilityLabel={`Ảnh đại diện của ${displayName}${showOnline ? ', đang hoạt động' : ''}`}>
      <KoolaText
        weight="800"
        style={{
          color: fallbackTextColor,
          fontSize: Math.max(13, px * 0.4),
          lineHeight: px * 0.48,
        }}>
        {initial}
      </KoolaText>
      {showOnline && <View style={styles.onlineDot} importantForAccessibility="no" />}
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

function makeStyles(semantic: SemanticTokens, px: number) {
  const dotSize = Math.max(10, px * 0.22);
  return StyleSheet.create({
    shell: {
      backgroundColor: semantic.surface.level1,
      overflow: 'hidden',
    },
    image: {
      resizeMode: 'cover',
    },
    placeholder: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    onlineDot: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: dotSize,
      height: dotSize,
      borderRadius: dotSize / 2,
      backgroundColor: semantic.status.success,
      borderWidth: 2,
      borderColor: semantic.surface.level1,
    },
  });
}

function relativeLuminance(color: string): number {
  const normalized = color.replace('#', '');
  if (normalized.length !== 6) return 0;
  const channels = [0, 2, 4].map((offset) => {
    const srgb = parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(a: string, b: string): number {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

function pickReadableColor(background: string, a: string, b: string): string {
  return contrastRatio(background, a) >= contrastRatio(background, b) ? a : b;
}
