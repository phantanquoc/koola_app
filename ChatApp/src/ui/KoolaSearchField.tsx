import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTheme } from './ThemeProvider';
import { koolaRadii, koolaSpacing, koolaOpacity } from './theme';
import type { SemanticTokens } from './tokens/semantic';

export interface KoolaSearchFieldProps extends Omit<TextInputProps, 'style'> {
  /** Called when the clear button is pressed */
  onClear?: () => void;
  /** Disable the input */
  disabled?: boolean;
}

export const KoolaSearchField: React.FC<KoolaSearchFieldProps> = ({
  onClear,
  disabled = false,
  value,
  onChangeText,
  onFocus,
  onBlur,
  placeholder = 'Tìm kiếm',
  ...props
}) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const inputRef = useRef<TextInput>(null);
  const [localValue, setLocalValue] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const displayValue = value !== undefined ? value : localValue;

  const handleChange = (text: string) => {
    if (value === undefined) setLocalValue(text);
    onChangeText?.(text);
  };

  const handleClear = () => {
    if (value === undefined) setLocalValue('');
    onChangeText?.('');
    onClear?.();
    inputRef.current?.clear();
  };

  return (
    <View
      style={[
        styles.container,
        focused && styles.focused,
        disabled && styles.disabled,
      ]}
      accessibilityRole="search">
      <MaterialIcons
        name="search"
        size={20}
        color={tokens.semantic.text.faint}
        style={styles.icon}
      />
      <TextInput
        ref={inputRef}
        {...props}
        value={displayValue}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={tokens.semantic.text.faint}
        underlineColorAndroid="transparent"
        editable={!disabled}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={styles.input}
        accessibilityLabel={placeholder}
      />
      {displayValue.length > 0 && !disabled && (
        <Pressable
          onPress={handleClear}
          style={styles.clearButton}
          accessibilityRole="button"
          accessibilityLabel="Xóa tìm kiếm">
          <MaterialIcons
            name="close"
            size={18}
            color={tokens.semantic.text.muted}
          />
        </Pressable>
      )}
    </View>
  );
};

function makeStyles(semantic: SemanticTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: semantic.surface.level0,
      borderRadius: koolaRadii.sm,
      paddingHorizontal: koolaSpacing.md,
      minHeight: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
    },
    focused: {
      borderWidth: 2,
      borderColor: semantic.focus.ring,
    },
    disabled: {
      opacity: koolaOpacity.disabled,
    },
    icon: {
      marginRight: koolaSpacing.sm,
    },
    input: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
      color: semantic.text.primary,
      paddingVertical: 0,
      backgroundColor: 'transparent',
    },
    clearButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: -koolaSpacing.md,
    },
  });
}
