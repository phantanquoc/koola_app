import React from 'react';
import {
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText } from './KoolaText';
import { koolaColors, koolaRadii, koolaTypography } from './theme';

interface KoolaTextInputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: string;
}

export const KoolaTextInput: React.FC<KoolaTextInputProps> = ({
  label,
  error,
  icon,
  style,
  placeholderTextColor = koolaColors.faint,
  ...props
}) => (
  <View style={styles.wrapper}>
    {label ? (
      <KoolaText variant="caption" tone="muted" weight="700" style={styles.label}>
        {label}
      </KoolaText>
    ) : null}
    <View style={[styles.inputShell, error ? styles.inputError : null]}>
      {icon ? (
        <MaterialIcons name={icon} size={20} color={koolaColors.faint} />
      ) : null}
      <TextInput
        {...props}
        underlineColorAndroid="transparent"
        placeholderTextColor={placeholderTextColor}
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

const styles = StyleSheet.create({
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
    borderColor: koolaColors.line,
    backgroundColor: koolaColors.surface,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputError: {
    borderColor: koolaColors.danger,
  },
  input: {
    flex: 1,
    color: koolaColors.ink,
    fontSize: koolaTypography.body.fontSize,
    minHeight: 48,
    paddingVertical: 0,
  },
  error: {
    marginLeft: 2,
  },
});
