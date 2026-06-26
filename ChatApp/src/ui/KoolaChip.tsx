import React, { useMemo } from 'react';
import { Pressable, PressableProps, StyleSheet } from 'react-native';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import { koolaRadii, type Palette } from './theme';

interface KoolaChipProps extends Omit<PressableProps, 'children'> {
  label: string;
  selected?: boolean;
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    chip: {
      minHeight: 34,
      borderRadius: koolaRadii.pill,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.canvas,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
    },
    selected: {
      backgroundColor: p.primary,
      borderColor: p.primary,
    },
    pressed: {
      opacity: 0.78,
    },
  });

export const KoolaChip: React.FC<KoolaChipProps> = ({
  label,
  selected,
  style,
  onPressIn,
  onPressOut,
  ...props
}) => {
  const [pressed, setPressed] = React.useState(false);
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={[
        styles.chip,
        selected ? styles.selected : null,
        pressed ? styles.pressed : null,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}>
      <KoolaText
        variant="caption"
        weight="700"
        tone={selected ? 'surface' : 'muted'}
        numberOfLines={1}>
        {label}
      </KoolaText>
    </Pressable>
  );
};
