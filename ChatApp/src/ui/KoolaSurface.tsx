import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { koolaColors, koolaRadii, koolaShadows } from './theme';

interface KoolaSurfaceProps extends ViewProps {
  variant?: 'flat' | 'raised' | 'soft' | 'outline';
  className?: string;
}

export const KoolaSurface: React.FC<KoolaSurfaceProps> = ({
  variant = 'flat',
  className,
  style,
  ...props
}) => {
  return (
    <View
      {...props}
      className={className}
      style={[styles.base, styles[variant], style]}
    />
  );
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: koolaColors.surface,
    borderRadius: koolaRadii.md,
  },
  flat: {},
  raised: {
    ...koolaShadows.soft,
  },
  soft: {
    backgroundColor: koolaColors.canvas,
  },
  outline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
  },
});
