import React, { useMemo } from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';
import { koolaRadii, koolaShadows, type Palette } from './theme';

interface KoolaSurfaceProps extends ViewProps {
  variant?: 'flat' | 'raised' | 'soft' | 'outline';
  className?: string;
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    base: {
      backgroundColor: p.surface,
      borderRadius: koolaRadii.md,
    },
    flat: {},
    raised: {
      ...koolaShadows.soft,
    },
    soft: {
      backgroundColor: p.canvas,
    },
    outline: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
    },
  });

export const KoolaSurface: React.FC<KoolaSurfaceProps> = ({
  variant = 'flat',
  className,
  style,
  ...props
}) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  return (
    <View
      {...props}
      className={className}
      style={[styles.base, styles[variant], style]}
    />
  );
};
