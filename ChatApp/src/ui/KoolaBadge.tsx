import React from 'react';
import { View, StyleSheet } from 'react-native';
import { KoolaText } from './KoolaText';
import { koolaColors, koolaRadii } from './theme';

interface KoolaBadgeProps {
  label: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'muted';
}

const toneStyles = {
  primary: { backgroundColor: koolaColors.primarySoft, color: koolaColors.primary },
  success: { backgroundColor: koolaColors.successSoft, color: koolaColors.success },
  warning: { backgroundColor: koolaColors.warningSoft, color: koolaColors.warningInk },
  danger: { backgroundColor: koolaColors.dangerSoft, color: koolaColors.danger },
  muted: { backgroundColor: koolaColors.canvas, color: koolaColors.muted },
} as const;

export const KoolaBadge: React.FC<KoolaBadgeProps> = ({
  label,
  tone = 'muted',
}) => (
  <View style={[styles.badge, { backgroundColor: toneStyles[tone].backgroundColor }]}>
    <KoolaText
      variant="caption"
      weight="700"
      numberOfLines={1}
      style={{ color: toneStyles[tone].color }}>
      {label}
    </KoolaText>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: koolaRadii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
});
