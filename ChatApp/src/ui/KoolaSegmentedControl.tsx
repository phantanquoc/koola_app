import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import { koolaOpacity, koolaRadii, koolaSpacing } from './theme';
import type { SemanticTokens } from './tokens/semantic';

export interface KoolaSegmentedControlOption<T extends string = string> {
  value: T;
  label: string;
}

export interface KoolaSegmentedControlProps<T extends string = string> {
  options: KoolaSegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function KoolaSegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  disabled = false,
}: KoolaSegmentedControlProps<T>) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const [focusedValue, setFocusedValue] = React.useState<T | null>(null);
  const [pressedValue, setPressedValue] = React.useState<T | null>(null);

  return (
    <View
      style={[styles.container, disabled && styles.disabled]}
      accessibilityRole="tablist"
      accessibilityState={{ disabled }}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[
              styles.segment,
              isSelected && styles.segmentSelected,
              focusedValue === option.value && styles.segmentFocused,
              pressedValue === option.value && !disabled && styles.segmentPressed,
            ]}
            onPress={() => {
              if (!disabled && !isSelected) onChange(option.value);
            }}
            onPressIn={() => setPressedValue(option.value)}
            onPressOut={() => setPressedValue((current) => (
              current === option.value ? null : current
            ))}
            disabled={disabled}
            onFocus={() => setFocusedValue(option.value)}
            onBlur={() => setFocusedValue((current) => (
              current === option.value ? null : current
            ))}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected, disabled }}
            accessibilityLabel={option.label}>
            <KoolaText
              variant="caption"
              weight="700"
              tone={isSelected ? 'primary' : 'muted'}>
              {option.label}
            </KoolaText>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(semantic: SemanticTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      borderRadius: koolaRadii.sm,
      backgroundColor: semantic.surface.level0,
      padding: koolaSpacing.xs,
    },
    segment: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: koolaSpacing.sm,
      borderRadius: koolaRadii.xs,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    segmentSelected: {
      backgroundColor: semantic.surface.level1,
    },
    segmentFocused: {
      borderColor: semantic.focus.ring,
    },
    segmentPressed: {
      opacity: koolaOpacity.pressed,
    },
    disabled: {
      opacity: koolaOpacity.disabled,
    },
  });
}
