import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { koolaColors } from './theme';

export const KoolaDivider: React.FC<ViewProps> = ({ style, ...props }) => (
  <View {...props} style={[styles.divider, style]} />
);

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: koolaColors.line,
  },
});
