import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaButton } from './KoolaButton';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import { koolaRadii, koolaSpacing } from './theme';
import type { SemanticTokens } from './tokens/semantic';

export interface KoolaStateProps extends Omit<ViewProps, 'style'> {
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: koolaSpacing.xl,
      paddingVertical: koolaSpacing.xxl,
      gap: koolaSpacing.md,
    },
    iconShell: {
      width: 58,
      height: 58,
      borderRadius: koolaRadii.lg,
      backgroundColor: semantic.action.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    action: {
      marginTop: 8,
    },
  });

export const KoolaState: React.FC<KoolaStateProps> = ({
  icon = 'inbox',
  title,
  message,
  actionLabel,
  onActionPress,
  loading = false,
  style,
  ...viewProps
}) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  return (
    <View {...viewProps} style={[styles.container, style]}>
      <View style={styles.iconShell}>
        {loading ? (
          <ActivityIndicator
            color={tokens.semantic.action.primary}
            accessibilityRole="progressbar"
            accessibilityLabel={title}
          />
        ) : (
          <MaterialIcons
            name={icon}
            size={28}
            color={tokens.semantic.action.primary}
          />
        )}
      </View>
      <KoolaText variant="heading" align="center" numberOfLines={2}>
        {title}
      </KoolaText>
      {message ? (
        <KoolaText variant="body" tone="muted" align="center">
          {message}
        </KoolaText>
      ) : null}
      {actionLabel && onActionPress ? (
        <KoolaButton
          title={actionLabel}
          variant="secondary"
          onPress={onActionPress}
          style={styles.action}
        />
      ) : null}
    </View>
  );
};
