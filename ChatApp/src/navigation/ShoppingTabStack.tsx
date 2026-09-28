import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTheme, KoolaText, koolaRadii, koolaIconWell, koolaOpacity } from '../ui';
import { LightFieldBackground } from '../screens/main/components/personal/LightFieldBackground';
import { ShoppingHeaderContext, type ShoppingHeaderConfig } from './ShoppingHeaderContext';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ShoppingTabStackParamList } from './types';
import ShoppingHomeScreen from '../screens/shopping/ShoppingHomeScreen';
import ShoppingProductDetailScreen from '../screens/shopping/ShoppingProductDetailScreen';
import ShoppingStorefrontScreen from '../screens/shopping/ShoppingStorefrontScreen';
import { getNotchHeaderHeight, NotchHeader } from '../components/NotchHeader';

const Stack = createNativeStackNavigator<ShoppingTabStackParamList>();

const ShoppingTabStack: React.FC = () => {
  const { resolvedScheme, tokens } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const [headerConfig, setHeaderConfig] = useState<ShoppingHeaderConfig | null>(null);
  const [focusedRouteName, setFocusedRouteName] =
    useState<keyof ShoppingTabStackParamList>('ShoppingHome');

  // Gate: KOOLA wordmark only on ShoppingHome. When a product/storefront
  // screen is focused, its config must be shown even if the previous
  // screen's useFocusEffect cleanup (setConfig(null)) races after the next
  // screen's focus effect — same race fixed in ChatTabStack via
  // focusedRouteName. DetachPreviousScreen:false keeps both mounted but
  // blur/focus still fire in the same commit.
  const displayConfig = focusedRouteName === 'ShoppingHome' ? null : headerConfig;
  const headerCtx = React.useMemo(
    () => ({ config: headerConfig, setConfig: setHeaderConfig }),
    [headerConfig],
  );

  return (
    <ShoppingHeaderContext.Provider value={headerCtx}>
      <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
        <LightFieldBackground />
        <ShoppingNotchHeader config={displayConfig} />
        <Stack.Navigator
          screenListeners={({ route }) => ({
            focus: () => setFocusedRouteName(route.name as keyof ShoppingTabStackParamList),
          })}
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            statusBarTranslucent: true,
            navigationBarTranslucent: true,
            statusBarStyle: isDark ? 'light' : 'dark',
            contentStyle: { backgroundColor: 'transparent' } as never,
            // @ts-expect-error cardStyle is valid for native-stack but types lag
            cardStyle: { backgroundColor: 'transparent' },
            // Fabric fix: native-stack detaches the previous screen off-tree to save
            // memory; popping Storefront while ProductDetail is detached desyncs
            // Fabric's ViewGroup child count → "Cannot remove child at index 1"
            // crash (MountItemDispatcher). Keep previous screen mounted.
            detachPreviousScreen: false,
          }}>
          <Stack.Screen name="ShoppingHome" component={ShoppingHomeScreen} />
          <Stack.Screen name="ShoppingProductDetail" component={ShoppingProductDetailScreen} />
          <Stack.Screen name="ShoppingStorefront" component={ShoppingStorefrontScreen} />
        </Stack.Navigator>
      </View>
    </ShoppingHeaderContext.Provider>
  );
};

// ── Shared notch header — wordmark (default) / nav / product ────────────────
const ShoppingNotchHeader: React.FC<{ config: ShoppingHeaderConfig | null }> = ({ config }) => {
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  const flatH = getNotchHeaderHeight(insets.top, config ? 'nav' : 'wordmark');
  const isDark = resolvedScheme === 'dark';

  // Product detail variant: ←  |  Shop name (truncated)  |  share  cart  search
  if (config?.variant === 'product') {
    return (
      <View style={[styles.host2, { height: flatH, overflow: 'hidden' as const }, { position: 'absolute', top: 0, left: 0, right: 0 }]}>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: isDark ? 'rgba(15,20,25,0.72)' : 'rgba(255,255,255,0.84)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.72, overflow: 'hidden' }}>
          <LightFieldBackground windowSized />
        </View>
        <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top, bottom: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
          <Pressable
            onPress={config.onBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            style={({ pressed }) => [navStyles.backBtn, { backgroundColor: koolaIconWell[resolvedScheme] }, pressed && { opacity: koolaOpacity.pressed }]}>
            <MaterialIcons name="arrow-back" size={22} color={tokens.semantic.text.primary} />
          </Pressable>
          <View pointerEvents="box-none" style={navStyles.titleCenter}>
            <Pressable
              onPress={config.onShopPress}
              disabled={!config.onShopPress}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Xem gian hàng"
              android_ripple={config.onShopPress ? { color: tokens.semantic.border.subtle, borderless: false } : undefined}
              style={({ pressed }) => [
                navStyles.titlePress,
                pressed && config.onShopPress && { backgroundColor: tokens.semantic.surface.level0, opacity: 1 },
              ]}>
              <KoolaText variant="label" weight="700" numberOfLines={1} style={{ textAlign: 'center', color: tokens.semantic.text.primary }}>
                {config.shopName}
              </KoolaText>
            </Pressable>
          </View>
          <View style={navStyles.actionGroup}>
            <Pressable
              onPress={config.onShare}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Chia sẻ"
              style={({ pressed }) => [navStyles.actionBtn, pressed && { opacity: koolaOpacity.pressed }]}>
              <MaterialIcons name="share" size={20} color={tokens.semantic.text.primary} />
            </Pressable>
            <Pressable
              onPress={config.onCart}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Giỏ hàng"
              style={({ pressed }) => [navStyles.actionBtn, pressed && { opacity: koolaOpacity.pressed }]}>
              <MaterialIcons name="shopping-cart" size={20} color={tokens.semantic.text.primary} />
            </Pressable>
            <Pressable
              onPress={config.onSearch}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Tìm kiếm"
              style={({ pressed }) => [navStyles.actionBtn, pressed && { opacity: koolaOpacity.pressed }]}>
              <MaterialIcons name="search" size={20} color={tokens.semantic.text.primary} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // Nav variant: ←  Title  (same as Personal nav — back pill + heading)
  if (config?.variant === 'nav') {
    return (
      <View style={[styles.host2, { height: flatH, overflow: 'hidden' as const }, { position: 'absolute', top: 0, left: 0, right: 0 }]}>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: isDark ? 'rgba(15,20,25,0.72)' : 'rgba(255,255,255,0.84)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.72, overflow: 'hidden' }}>
          <LightFieldBackground windowSized />
        </View>
        <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top, bottom: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
          <Pressable
            onPress={config.onBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            style={({ pressed }) => [navStyles.backBtn, { backgroundColor: koolaIconWell[resolvedScheme] }, pressed && { opacity: koolaOpacity.pressed }]}>
            <MaterialIcons name="arrow-back" size={22} color={tokens.semantic.text.primary} />
          </Pressable>
          <KoolaText variant="heading" weight="700" style={{ color: tokens.semantic.text.primary, marginLeft: 8 }}>
            {config.title}
          </KoolaText>
        </View>
      </View>
    );
  }

  // Default: KOOLA wordmark — delegate to existing NotchHeader so list keeps
  // exactly the same visuals as before, and as ConnectTab/others do.
  return <NotchHeader style={{ position: 'absolute', top: 0, left: 0, right: 0 }} />;
};

const navStyles = StyleSheet.create({
  backBtn: { width: 36, height: 36, borderRadius: koolaRadii.pill, alignItems: 'center', justifyContent: 'center' },
  titleCenter: {
    position: 'absolute',
    left: 48,
    right: 140,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  titlePress: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: koolaRadii.pill,
    overflow: 'hidden',
  },
  actionGroup: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 'auto' },
  actionBtn: { width: 36, height: 36, borderRadius: koolaRadii.pill, alignItems: 'center', justifyContent: 'center' },
});

const styles = StyleSheet.create({
  host: { flex: 1 },
  host2: { width: '100%', zIndex: 10 },
});

export default ShoppingTabStack;
