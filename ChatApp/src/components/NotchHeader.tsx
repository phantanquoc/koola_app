import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KoolaText, useTheme } from '../ui';
import { LightFieldBackground } from '../screens/main/components/personal/LightFieldBackground';

export interface NotchHeaderProps {
  style?: StyleProp<ViewStyle>;
  /** When set, renders centered title instead of KOOLA wordmark */
  title?: string;
}

export const NOTCH_WING_INSET = 4;

/** Slightly taller than original 22 — trimmed bottom only on request */
export const NOTCH_HEADER_CONTENT_H = 24;
/** Total header height given the device top inset — single source of truth
 *  for consumers that need to offset below the header (ChatHome, Shopping,
 *  Settings). Pair with `useSafeAreaInsets().top`. */
export const getNotchHeaderHeight = (topInset: number) =>
  topInset + NOTCH_WING_INSET + NOTCH_HEADER_CONTENT_H;

export const NotchHeader: React.FC<NotchHeaderProps> = ({ style, title }) => {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const flatH = getNotchHeaderHeight(insets.top);
  return (
    <View style={[styles.host, { height: flatH, overflow: 'hidden' as const }, style]}>
      <LightFieldBackground windowSized />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: insets.top,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 2,
        }}>
        {title ? (
          <KoolaText variant="label" weight="700" style={{ color: tokens.semantic.text.primary }}>
            {title}
          </KoolaText>
        ) : (
          <Image
            source={require('../assets/logo_koola_wordmark.png')}
            style={{ width: 99, height: 17 }}
            resizeMode="contain"
            accessibilityLabel="KOOLA"
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  host: { width: '100%', zIndex: 10 },
});
