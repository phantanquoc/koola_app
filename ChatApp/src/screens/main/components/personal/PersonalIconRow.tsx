import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaText,
  koolaIconWell,
  koolaOpacity,
  koolaRadii,
  koolaSpacing,
  useTheme,
} from '../../../../ui';
import type { SemanticTokens } from '../../../../ui/tokens/semantic';

export interface PersonalIconRowProps {
  /** MaterialIcons glyph rendered inside the well. */
  icon: string;
  /** Primary text. */
  title: string;
  /** Optional secondary line under the title. */
  subtitle?: string;
  /** Optional emphasized trailing value (weight 800 per design D4). */
  value?: string;
  /** Optional trailing node (e.g. a Switch) — replaces the chevron. */
  trailing?: React.ReactNode;
  /** Press handler; without it the row renders as a static View. */
  onPress?: () => void;
  disabled?: boolean;
  /** Selection state for assistive tech + soft accent fill. */
  selected?: boolean;
  /** Accent rows take `action.primary` for glyph and value (design D3). */
  accent?: boolean;
  /** Show the trailing chevron (default: pressable and no `trailing`). */
  showChevron?: boolean;
  /** Accessible name override for interactive rows. */
  accessibilityLabel?: string;
}

/** Circular icon-well edge (design D3). */
const WELL_SIZE = 36;

/**
 * Card row in the Personal home card language (design D3): a 36px circular well
 * from the `koolaIconWell` primitive, a glyph colored by semantic tokens, a
 * title/subtitle column, an optional emphasized value, an optional trailing
 * node, and an optional chevron.
 *
 * Press handling mirrors `KoolaListItem`: role `button`, name from
 * `accessibilityLabel ?? title`, selected/disabled exposed through
 * `accessibilityState`, and pressed feedback as an opacity drop. The 52dp min
 * height keeps every row above the 44dp touch-target floor.
 */
export const PersonalIconRow: React.FC<PersonalIconRowProps> = ({
  icon,
  title,
  subtitle,
  value,
  trailing,
  onPress,
  disabled = false,
  selected = false,
  accent = false,
  showChevron,
  accessibilityLabel,
}) => {
  const { tokens, resolvedScheme } = useTheme();
  const styles = useMemo(
    () => makeStyles(tokens.semantic, resolvedScheme),
    [tokens.semantic, resolvedScheme],
  );
  const hasChevron = showChevron ?? (!!onPress && !trailing);
  const glyphColor = accent
    ? tokens.semantic.action.primary
    : tokens.semantic.text.muted;

  const content = (
    <>
      <View style={styles.well}>
        <MaterialIcons name={icon} size={20} color={glyphColor} />
      </View>
      <View style={styles.content}>
        <KoolaText
          variant="body"
          weight="600"
          numberOfLines={2}
          tone={disabled ? 'faint' : 'ink'}>
          {title}
        </KoolaText>
        {subtitle ? (
          <KoolaText variant="caption" tone="muted" numberOfLines={2}>
            {subtitle}
          </KoolaText>
        ) : null}
      </View>
      {value ? (
        <KoolaText
          variant="body"
          weight="800"
          numberOfLines={1}
          tone={accent ? 'primary' : 'ink'}
          style={styles.value}>
          {value}
        </KoolaText>
      ) : null}
      {trailing}
      {hasChevron ? (
        <MaterialIcons
          name="chevron-right"
          size={22}
          color={tokens.semantic.text.faint}
        />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View
        style={[
          styles.row,
          selected && styles.selected,
          disabled && styles.disabled,
        ]}
        accessibilityState={disabled ? { disabled: true } : undefined}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ selected, disabled }}>
      {content}
    </Pressable>
  );
};

function makeStyles(semantic: SemanticTokens, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      gap: koolaSpacing.md,
      borderRadius: koolaRadii.sm,
    },
    well: {
      width: WELL_SIZE,
      height: WELL_SIZE,
      borderRadius: koolaRadii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: koolaIconWell[scheme],
    },
    content: {
      flex: 1,
    },
    value: {
      flexShrink: 1,
      textAlign: 'right',
    },
    selected: {
      backgroundColor: semantic.action.primarySoft,
    },
    disabled: {
      opacity: koolaOpacity.disabled,
    },
    pressed: {
      opacity: koolaOpacity.pressed,
    },
  });
}
