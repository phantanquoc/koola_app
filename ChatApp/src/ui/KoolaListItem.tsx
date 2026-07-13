import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, ViewProps } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import { koolaSpacing, koolaOpacity } from './theme';
import type { SemanticTokens } from './tokens/semantic';

export interface KoolaListItemProps {
  /** Primary text */
  title: string;
  /** Optional secondary text */
  subtitle?: string;
  /** Leading icon name (MaterialIcons) */
  icon?: string;
  /** Leading icon color override */
  iconColor?: string;
  /** Custom leading element (replaces icon) */
  leading?: React.ReactNode;
  /** Custom trailing element (replaces chevron) */
  trailing?: React.ReactNode;
  /** Show trailing chevron (default true when onPress provided) */
  showChevron?: boolean;
  /** Press handler */
  onPress?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Selected state */
  selected?: boolean;
  /** Accessible label override for interactive rows */
  accessibilityLabel?: string;
}

export const KoolaListItem: React.FC<KoolaListItemProps> = ({
  title,
  subtitle,
  icon,
  iconColor,
  leading,
  trailing,
  showChevron,
  onPress,
  disabled = false,
  selected = false,
  accessibilityLabel,
}) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const [isPressed, setIsPressed] = React.useState(false);
  const hasChevron = showChevron ?? (!!onPress && !trailing);

  const leadingElement = leading ?? (icon ? (
    <MaterialIcons
      name={icon}
      size={22}
      color={iconColor ?? tokens.semantic.action.primary}
      style={styles.icon}
    />
  ) : null);

  const content = (
    <>
      {leadingElement}
      <View style={styles.content}>
        <KoolaText
          variant="label"
          numberOfLines={2}
          tone={disabled ? 'faint' : 'ink'}>
          {title}
        </KoolaText>
        {subtitle ? (
          <KoolaText variant="caption" tone="muted" numberOfLines={3}>
            {subtitle}
          </KoolaText>
        ) : null}
      </View>
      {trailing}
      {hasChevron && (
        <MaterialIcons
          name="chevron-right"
          size={22}
          color={tokens.semantic.text.faint}
        />
      )}
    </>
  );

  if (!onPress) {
    const staticProps: ViewProps = {
      accessibilityState: disabled ? { disabled: true } : undefined,
    };
    return (
      <View
        {...staticProps}
        style={[
          styles.container,
          selected && styles.selected,
          disabled && styles.disabled,
        ]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      style={[
        styles.container,
        selected && styles.selected,
        disabled && styles.disabled,
        isPressed && !disabled && styles.pressed,
      ]}
      onPress={onPress}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ selected, disabled }}>
      {content}
    </Pressable>
  );
};

function makeStyles(semantic: SemanticTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingHorizontal: koolaSpacing.lg,
      paddingVertical: koolaSpacing.md,
      backgroundColor: semantic.surface.level1,
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
    icon: {
      marginRight: koolaSpacing.md,
    },
    content: {
      flex: 1,
      marginRight: koolaSpacing.sm,
    },
  });
}
