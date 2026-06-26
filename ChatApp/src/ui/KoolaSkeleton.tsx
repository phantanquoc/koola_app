import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';
import { koolaRadii } from './theme';

interface KoolaSkeletonProps extends ViewProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
}

export const KoolaSkeleton: React.FC<KoolaSkeletonProps> = ({
  width = '100%',
  height = 16,
  radius = koolaRadii.sm,
  style,
  ...props
}) => {
  const { palette } = useTheme();
  return (
    <View
      {...props}
      style={[
        styles.skeleton,
        { backgroundColor: palette.skeleton, width, height, borderRadius: radius },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  skeleton: {},
});
