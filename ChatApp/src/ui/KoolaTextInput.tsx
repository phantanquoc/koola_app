import React, { useMemo } from 'react';
import {
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import { koolaRadii, koolaTypography, type Palette } from './theme';

interface KoolaTextInputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: string;
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    wrapper: {
      gap: 6,
    },
    label: {
      marginLeft: 2,
    },
    inputShell: {
      minHeight: 50,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      backgroundColor: p.surface,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    inputError: {
      borderColor: p.danger,
    },
    input: {
      flex: 1,
      color: p.ink,
      fontSize: koolaTypography.body.fontSize,
      minHeight: 48,
      paddingVertical: 0,
    },
    error: {
      marginLeft: 2,
    },
  });

export const KoolaTextInput: React.FC<KoolaTextInputProps> = ({
  label,
  error,
  icon,
  style,
  placeholderTextColor,
  ...props
}) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const resolvedPlaceholderColor = placeholderTextColor ?? palette.faint;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <KoolaText variant="caption" tone="muted" weight="700" style={styles.label}>
          {label}
        </KoolaText>
      ) : null}
      <View style={[styles.inputShell, error ? styles.inputError : null]}>
        {icon ? (
          <MaterialIcons name={icon} size={20} color={palette.faint} />
        ) : null}
        <TextInput
          {...props}
          underlineColorAndroid="transparent"
          placeholderTextColor={resolvedPlaceholderColor}
          style={[styles.input, style]}
        />
      </View>
      {error ? (
        <KoolaText variant="caption" tone="danger" style={styles.error}>
          {error}
        </KoolaText>
      ) : null}
    </View>
  );
};
