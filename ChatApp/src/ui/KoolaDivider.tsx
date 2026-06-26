import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';

export const KoolaDivider: React.FC<ViewProps> = ({ style, ...props }) => {
  const { palette } = useTheme();
  return (
    <View
      {...props}
      style={[styles.divider, { backgroundColor: palette.line }, style]}
    />
  );
};

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
