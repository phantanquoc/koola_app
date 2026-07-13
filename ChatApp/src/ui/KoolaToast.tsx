import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Toast, {
  type ToastConfig,
  type ToastConfigParams,
} from 'react-native-toast-message';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import { koolaDurations } from './tokens/motion';
import { koolaRadii, koolaSpacing } from './theme';
import type { SemanticTokens } from './tokens/semantic';

export type KoolaToastVariant = 'info' | 'success' | 'warning' | 'danger';

const DEFAULT_VISIBILITY_TIME = koolaDurations.slow * 8;

export interface KoolaToastProps {
  message: string;
  detail?: string;
  variant?: KoolaToastVariant;
  visible: boolean;
  onHide?: () => void;
  duration?: number;
}

export const KoolaToast: React.FC<KoolaToastProps> = ({
  message,
  detail,
  variant = 'info',
  visible,
  onHide,
  duration = DEFAULT_VISIBILITY_TIME,
}) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  useEffect(() => {
    if (!visible || !onHide || duration <= 0) return undefined;
    const timer = setTimeout(onHide, duration);
    return () => clearTimeout(timer);
  }, [duration, onHide, visible]);

  if (!visible) return null;

  const icon = variant === 'success'
    ? 'check-circle-outline'
    : variant === 'warning'
      ? 'warning-amber'
      : variant === 'danger'
        ? 'error-outline'
        : 'info-outline';
  const accent = variant === 'success'
    ? tokens.semantic.status.success
    : variant === 'warning'
      ? tokens.semantic.status.warning
      : variant === 'danger'
        ? tokens.semantic.status.danger
        : tokens.semantic.action.primary;

  return (
    <View
      style={styles.container}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert">
      <MaterialIcons name={icon} size={22} color={accent} />
      <View style={styles.copy}>
        <KoolaText variant="label" weight="700" numberOfLines={2}>
          {message}
        </KoolaText>
        {detail ? (
          <KoolaText variant="caption" tone="muted" numberOfLines={3}>
            {detail}
          </KoolaText>
        ) : null}
      </View>
    </View>
  );
};

type KoolaToastConfigProps = { variant?: KoolaToastVariant };

function renderToast(
  fallbackVariant: KoolaToastVariant,
  params: ToastConfigParams<KoolaToastConfigProps>,
) {
  return (
    <KoolaToast
      visible={params.isVisible}
      message={params.text1 ?? ''}
      detail={params.text2}
      variant={params.props?.variant ?? fallbackVariant}
    />
  );
}

export const koolaToastConfig: ToastConfig = {
  info: (params) => renderToast('info', params),
  success: (params) => renderToast('success', params),
  warning: (params) => renderToast('warning', params),
  error: (params) => renderToast('danger', params),
  koola: (params) => renderToast('info', params),
};

export function useKoolaToast() {
  const show = (
    message: string,
    variant: KoolaToastVariant = 'info',
    duration = DEFAULT_VISIBILITY_TIME,
  ) => {
    Toast.show({
      type: variant === 'danger' ? 'error' : variant,
      text1: message,
      visibilityTime: duration,
      props: { variant },
    });
  };

  return {
    show,
    hide: Toast.hide,
    toastElement: null as React.ReactNode,
  };
}

function makeStyles(semantic: SemanticTokens) {
  return StyleSheet.create({
    container: {
      width: '100%',
      maxWidth: 480,
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: semantic.surface.level2,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      paddingHorizontal: koolaSpacing.lg,
      paddingVertical: koolaSpacing.md,
    },
    copy: {
      flex: 1,
      marginLeft: koolaSpacing.md,
    },
  });
}
