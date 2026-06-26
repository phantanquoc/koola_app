import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import { koolaRadii, type Palette } from './theme';

interface KoolaBadgeProps {
  label: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'muted';
}

const makeToneStyles = (p: Palette) => ({
  primary: { backgroundColor: p.primarySoft, color: p.primary },
  success: { backgroundColor: p.successSoft, color: p.success },
  warning: { backgroundColor: p.warningSoft, color: p.warningInk },
  danger: { backgroundColor: p.dangerSoft, color: p.danger },
  muted: { backgroundColor: p.canvas, color: p.muted },
});

export const KoolaBadge: React.FC<KoolaBadgeProps> = ({
  label,
  tone = 'muted',
}) => {
  const { palette } = useTheme();
  const toneStyles = useMemo(() => makeToneStyles(palette), [palette]);

  return (
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
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: koolaRadii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
});
