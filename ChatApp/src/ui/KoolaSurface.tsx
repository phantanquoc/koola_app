import React, { useMemo } from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';
import { koolaRadii, koolaShadows } from './theme';
import type { SemanticTokens } from './tokens/semantic';

interface KoolaSurfaceProps extends ViewProps {
  variant?: 'flat' | 'raised' | 'soft' | 'outline';
  className?: string;
}

const makeStyles = (semantic: SemanticTokens, scheme: 'light' | 'dark') =>
  StyleSheet.create({
    base: {
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.md,
    },
    flat: {},
    raised:
      scheme === 'dark'
        ? {
            backgroundColor: semantic.surface.level2,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: semantic.border.subtle,
          }
        : {
            backgroundColor: semantic.surface.level2,
            ...koolaShadows.subtle,
          },
    soft: {
      backgroundColor: semantic.surface.level0,
    },
    outline: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
    },
  });

export const KoolaSurface: React.FC<KoolaSurfaceProps> = ({
  variant = 'flat',
  className,
  style,
  ...props
}) => {
  const { tokens, resolvedScheme } = useTheme();
  const styles = useMemo(
    () => makeStyles(tokens.semantic, resolvedScheme),
    [tokens.semantic, resolvedScheme],
  );

  return (
    <View
      {...props}
      className={className}
      style={[styles.base, styles[variant], style]}
    />
  );
};
