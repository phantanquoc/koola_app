import React from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaIconWell, koolaOpacity, koolaRadii, useTheme } from '../ui';
import { LightFieldBackground } from '../screens/main/components/personal/LightFieldBackground';

export interface NotchHeaderProps {
  style?: StyleProp<ViewStyle>;
  /** When set, renders centered title instead of KOOLA wordmark */
  title?: string;
  /** When set, renders a back icon + left-aligned title row instead of the
   *  centered wordmark/title — used by screens that take over the shared
   *  notch band (see PersonalHeaderContext). */
  onBack?: () => void;
}

export const NOTCH_WING_INSET = 4;

/** Slightly taller than original 22 — trimmed bottom only on request */
export const NOTCH_HEADER_CONTENT_H = 24;
/** Taller variant used when the band hosts a back button + title row */
export const NOTCH_HEADER_NAV_CONTENT_H = 36;
/** Total header height given the device top inset — single source of truth
 *  for consumers that need to offset below the header (ChatHome, Shopping,
 *  Settings). Pair with `useSafeAreaInsets().top`. */
export const getNotchHeaderHeight = (topInset: number, nav?: boolean) =>
  topInset + NOTCH_WING_INSET + (nav ? NOTCH_HEADER_NAV_CONTENT_H : NOTCH_HEADER_CONTENT_H);

export const NotchHeader: React.FC<NotchHeaderProps> = ({ style, title, onBack }) => {
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const flatH = getNotchHeaderHeight(insets.top, !!onBack);
  const isDark = resolvedScheme === 'dark';

  if (onBack) {
    return (
      <View style={[styles.host, { height: flatH, overflow: 'hidden' as const }, style]}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: isDark ? 'rgba(15,20,25,0.72)' : 'rgba(255,255,255,0.84)',
          }}
        />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.72, overflow: 'hidden' }}>
          <LightFieldBackground windowSized />
        </View>
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: insets.top,
            bottom: 0,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 8,
          }}>
          <Pressable
            onPress={onBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            style={({ pressed }) => [
              navStyles.backBtn,
              { backgroundColor: koolaIconWell[resolvedScheme] },
              pressed && { opacity: koolaOpacity.pressed },
            ]}>
            <MaterialIcons name="arrow-back" size={22} color={tokens.semantic.text.primary} />
          </Pressable>
          <KoolaText
            variant="heading"
            weight="700"
            style={{ color: tokens.semantic.text.primary, marginLeft: 8 }}>
            {title}
          </KoolaText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.host, { height: flatH, overflow: 'hidden' as const }, style]}>
      {/* Frosted base: lets scrolled content show faintly underneath */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: isDark ? 'rgba(15,20,25,0.72)' : 'rgba(255,255,255,0.84)',
        }}
      />
      {/* Bloom slice kept but softened so the frost reads, still aligns with page field */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.72, overflow: 'hidden' }}>
        <LightFieldBackground windowSized />
      </View>
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

const navStyles = StyleSheet.create({
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: koolaRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
