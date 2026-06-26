import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaButton } from './KoolaButton';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import { koolaRadii, type Palette } from './theme';

interface KoolaStateProps {
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 32,
      gap: 10,
    },
    iconShell: {
      width: 58,
      height: 58,
      borderRadius: koolaRadii.lg,
      backgroundColor: p.primarySoft,
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
  style,
}) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconShell}>
        <MaterialIcons name={icon} size={28} color={palette.primary} />
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
