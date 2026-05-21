import React from 'react';
import { Pressable, PressableProps, StyleSheet } from 'react-native';
import { KoolaText } from './KoolaText';
import { koolaColors, koolaRadii } from './theme';

interface KoolaChipProps extends Omit<PressableProps, 'children'> {
  label: string;
  selected?: boolean;
}

export const KoolaChip: React.FC<KoolaChipProps> = ({
  label,
  selected,
  style,
  onPressIn,
  onPressOut,
  ...props
}) => {
  const [pressed, setPressed] = React.useState(false);

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

const styles = StyleSheet.create({
  chip: {
    minHeight: 34,
    borderRadius: koolaRadii.pill,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: koolaColors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
  },
  selected: {
    backgroundColor: koolaColors.primary,
    borderColor: koolaColors.primary,
  },
  pressed: {
    opacity: 0.78,
  },
});
