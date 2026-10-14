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
import ShoppingCartScreen from '../screens/shopping/ShoppingCartScreen';
import ShoppingCheckoutScreen from '../screens/shopping/ShoppingCheckoutScreen';
import ShoppingOrdersScreen from '../screens/shopping/ShoppingOrdersScreen';
import ShoppingOrderDetailScreen from '../screens/shopping/ShoppingOrderDetailScreen';
import { getNotchHeaderHeight, NotchHeader } from '../components/NotchHeader';
import { useComingSoonToast } from '../hooks/useComingSoonToast';
import { useCart, cartBadgeLabel } from '../services/shopping/useCart';
import { useNavigation } from '@react-navigation/native';

const Stack = createNativeStackNavigator<ShoppingTabStackParamList>();

// ── Header cart icon + badge (commerce-catalog D12) ─────────────────────────
// Badge = total quantity from the shared cart store; hidden at 0, "99+" above
// 99. Reads are synchronous MMKV, so the count is right on the first frame.
const CartIconButton: React.FC<{ onPress?: () => void; color: string }> = ({ onPress, color }) => {
  const { tokens } = useTheme();
  const { totalQuantity } = useCart();
  const badge = cartBadgeLabel(totalQuantity);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={badge ? `Giỏ hàng, ${totalQuantity} sản phẩm` : 'Giỏ hàng'}
      style={({ pressed }) => [navStyles.actionBtn, pressed && { opacity: koolaOpacity.pressed }]}>
      <MaterialIcons name="shopping-cart" size={20} color={color} />
      {badge ? (
        <View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          style={[navStyles.cartBadge, { backgroundColor: tokens.semantic.status.danger, borderColor: tokens.semantic.surface.level1 }]}>
          <KoolaText variant="caption" weight="800" tone="surface" style={navStyles.cartBadgeText}>
            {badge}
          </KoolaText>
        </View>
      ) : null}
    </Pressable>
  );
};

const ShoppingTabStack: React.FC = () => {
  const { resolvedScheme, tokens } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const [headerConfig, setHeaderConfig] = useState<ShoppingHeaderConfig | null>(null);
  const [displayedHeaderConfig, setDisplayedHeaderConfig] = useState<ShoppingHeaderConfig | null>(null);
  const [focusedRouteName, setFocusedRouteName] =
    useState<keyof ShoppingTabStackParamList>('ShoppingHome');
  const { notify, toast } = useComingSoonToast();

  // Deferred header commit: Detail's useFocusEffect cleanup sets headerConfig
  // to null on blur (transitionStart). Committing that null mid-transition
  // would unmount ShoppingNotchHeader's subtree inside the same MountItem
  // batch where native-stack removes the Detail screen → Fabric ViewGroup
  // childCount desync ("Cannot remove child at index 0", MountItemDispatcher).
  // So queue header changes while transitioning and commit them on a timer
  // AFTER transitionEnd, when the native screen removal has landed. The timer
  // keeps the header mounted ~1 frame longer, separating the two removals
  // into different batches. It also guards push transitions (Home→Detail)
  // where the product header must not flash before the screen arrives.
  // Covers button back, gesture swipe back (fires transitionStart but may
  // skip transitionEnd mid-gesture), and interrupted transitions: the focus
  // listener below re-syncs focusedRouteName, and the queued header flushes
  // on the next transitionEnd or the focus-triggered effect.
  const transitioningRef = React.useRef(false);
  const pendingHeaderRef = React.useRef<ShoppingHeaderConfig | null>(null);
  const hasPendingRef = React.useRef(false);
  const headerConfigRef = React.useRef<ShoppingHeaderConfig | null>(null);
  headerConfigRef.current = headerConfig;
  // Defer focusedRouteName together with the header commit so the
  // `displayConfig` gate (ShoppingHome/Storefront → null) does not flip
  // in the same commit that removes the Detail screen. Both switch one
  // task later, in a separate MountItem batch from the native screen removal.
  const pendingRouteRef = React.useRef<keyof ShoppingTabStackParamList | null>(null);
  const commitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (transitioningRef.current) {
      pendingHeaderRef.current = headerConfig;
      hasPendingRef.current = true;
    } else {
      setDisplayedHeaderConfig(headerConfig);
    }
  }, [headerConfig]);

  React.useEffect(
    () => () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    [],
  );

  const commitPendingHeader = React.useCallback(() => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    // Use a short delay (not 0) so the header unmount lands in a *different*
    // Fabric batch than the native screen removal that fires at transitionEnd.
    // 0 still coalesces into the same MountItem batch on Android.
    commitTimerRef.current = setTimeout(() => {
      transitioningRef.current = false;
      if (pendingRouteRef.current !== null) {
        setFocusedRouteName(pendingRouteRef.current);
        pendingRouteRef.current = null;
      }
      if (hasPendingRef.current) {
        setDisplayedHeaderConfig(pendingHeaderRef.current);
        hasPendingRef.current = false;
      } else {
        setDisplayedHeaderConfig(headerConfigRef.current);
      }
    }, 50);
  }, []);

  // Gate: KOOLA wordmark only on ShoppingHome. ProductDetail uses headerConfig
  // (variant 'product'). Storefront has inline glass header, so hide the
  // parent header entirely — same pattern as BusinessProfileScreen in ConnectTab.
  // The header is always mounted (visible=false → opacity 0) so its unmount
  // never lands in the same MountItem batch as the Detail screen removal.
  const isHeaderVisible =
    focusedRouteName !== 'ShoppingHome' && focusedRouteName !== 'ShoppingStorefront';
  const headerCtx = React.useMemo(
    () => ({ config: headerConfig, setConfig: setHeaderConfig }),
    [headerConfig],
  );

  return (
    <ShoppingHeaderContext.Provider value={headerCtx}>
      <View style={[styles.host, { backgroundColor: tokens.semantic.bg.canvas }]}>
        <LightFieldBackground />
        <ShoppingNotchHeader config={displayedHeaderConfig} visible={isHeaderVisible} notify={notify} />
        <Stack.Navigator
          screenListeners={({ route }) => ({
            transitionStart: () => {
              if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
              transitioningRef.current = true;
            },
            transitionEnd: () => {
              pendingRouteRef.current = route.name as keyof ShoppingTabStackParamList;
              commitPendingHeader();
            },
            // Transition events are not reliable fallbacks on Android (gesture
            // may not fire transitionEnd every time), so track focus directly
            // and schedule the queued header commit from here as well. When
            // already transitioning, queue the route and flush on timer so the
            // header `displayConfig` gate does not flip inside the same commit
            // that removes the Detail screen.
            focus: () => {
              const next = route.name as keyof ShoppingTabStackParamList;
              if (transitioningRef.current) {
                pendingRouteRef.current = next;
                commitPendingHeader();
              } else {
                setFocusedRouteName(next);
              }
            },
          })}
          screenOptions={{
            headerShown: false,
            // Use a single animation for the whole stack so pop/push use the
            // same native ScreenStack tween. The previous 'none' at navigator
            // + 'ios_from_right' per-screen left the pop without a matching
            // enter animation and is a known cause of ViewGroup childCount
            // desync (removeViewAt in ReactClippingViewManager batch).
            animation: 'slide_from_right',
            gestureEnabled: true,
            statusBarTranslucent: true,
            navigationBarTranslucent: true,
            statusBarStyle: isDark ? 'light' : 'dark',
            contentStyle: { backgroundColor: tokens.semantic.bg.canvas } as never,
            // Fabric fix: native-stack detaches the previous screen off-tree to save
            // memory; popping Storefront while ProductDetail is detached desyncs
            // Fabric's ViewGroup child count → "Cannot remove child at index 1"
            // crash (MountItemDispatcher). Keep previous screen mounted.
            // Navigator-level flag alone is not sufficient on some
            // react-native-screens versions — per-screen override required.
            ...( { detachPreviousScreen: false } as object),
          }}>
          <Stack.Screen
            name="ShoppingHome"
            component={ShoppingHomeScreen}
            options={{
              freezeOnBlur: false,
              contentStyle: { backgroundColor: tokens.semantic.bg.canvas } as never,
              ...( { detachPreviousScreen: false } as object),
            }}
          />
          <Stack.Screen
            name="ShoppingProductDetail"
            component={ShoppingProductDetailScreen}
            options={{
              animation: 'slide_from_right',
              gestureEnabled: true,
              freezeOnBlur: false,
              contentStyle: { backgroundColor: tokens.semantic.bg.canvas } as never,
              ...( { detachPreviousScreen: false } as object),
            }}
          />
          <Stack.Screen
            name="ShoppingStorefront"
            component={ShoppingStorefrontScreen}
            options={{
              animation: 'slide_from_right',
              gestureEnabled: true,
              freezeOnBlur: false,
              contentStyle: { backgroundColor: tokens.semantic.bg.canvas } as never,
              ...( { detachPreviousScreen: false } as object),
            }}
          />
          <Stack.Screen
            name="ShoppingCart"
            component={ShoppingCartScreen}
            options={{
              freezeOnBlur: false,
              contentStyle: { backgroundColor: tokens.semantic.bg.canvas } as never,
              ...( { detachPreviousScreen: false } as object),
            }}
          />
          <Stack.Screen
            name="ShoppingCheckout"
            component={ShoppingCheckoutScreen}
            options={{
              freezeOnBlur: false,
              contentStyle: { backgroundColor: tokens.semantic.bg.canvas } as never,
              ...( { detachPreviousScreen: false } as object),
            }}
          />
          <Stack.Screen
            name="ShoppingOrders"
            component={ShoppingOrdersScreen}
            options={{
              freezeOnBlur: false,
              contentStyle: { backgroundColor: tokens.semantic.bg.canvas } as never,
              ...( { detachPreviousScreen: false } as object),
            }}
          />
          <Stack.Screen
            name="ShoppingOrderDetail"
            component={ShoppingOrderDetailScreen}
            options={{
              freezeOnBlur: false,
              contentStyle: { backgroundColor: tokens.semantic.bg.canvas } as never,
              ...( { detachPreviousScreen: false } as object),
            }}
          />
        </Stack.Navigator>
        {toast}
      </View>
    </ShoppingHeaderContext.Provider>
  );
};

// ── Shared notch header — wordmark (default) / nav / product ────────────────
const ShoppingNotchHeader: React.FC<{
  config: ShoppingHeaderConfig | null;
  visible: boolean;
  notify: (text?: string) => void;
}> = ({ config, visible, notify }) => {
  const insets = useSafeAreaInsets();
  const { tokens, resolvedScheme } = useTheme();
  // Keep height stable while hidden (Storefront → wordmark → nav use different
  // inset-dependent heights). Changing height during the pop also produces a
  // removeViewAt in ReactClippingViewManager when combined with the screen
  // removal. Fix the hidden placeholder to the wordmark height (+ no height
  // switch on pop) and compute the visible flatH separately.
  const hiddenH = getNotchHeaderHeight(insets.top, 'wordmark');
  const flatH = visible ? getNotchHeaderHeight(insets.top, config ? 'nav' : 'wordmark') : hiddenH;
  const isDark = resolvedScheme === 'dark';
  const [messagePressed, setMessagePressed] = useState(false);
  const [notificationPressed, setNotificationPressed] = useState(false);
  // This header renders beside (not inside) the stack navigator, so
  // useNavigation() resolves to the parent tab navigator; target the nested
  // stack screen explicitly.
  const tabNavigation = useNavigation();
  const openCart = React.useCallback(() => {
    (tabNavigation as unknown as { navigate: (name: string, params: unknown) => void }).navigate(
      'ShoppingTab',
      { screen: 'ShoppingCart' },
    );
  }, [tabNavigation]);

  // Always mounted: hidden states (Storefront / no focused route) are
  // opacity 0, not unmounted, so no removeViewAt in the pop batch.
  // Also freeze the tree when hidden — no children at all when hidden so
  // Fabric has nothing to removeViewAt that could overlap the detail screen
  // unmount.
  if (!visible) {
    return (
      <View
        collapsable={false}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: flatH, overflow: 'hidden', opacity: 0 }}
      />
    );
  }
  // No config yet (e.g. Home before focus cleanup) → fall through to wordmark.

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
            <CartIconButton onPress={config.onCart} color={tokens.semantic.text.primary} />
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
  const headerActions = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <CartIconButton onPress={openCart} color={tokens.semantic.text.muted} />
      <Pressable
        onPress={() => notify()}
        onPressIn={() => setMessagePressed(true)}
        onPressOut={() => setMessagePressed(false)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Tin nhắn"
        style={[
          {
            width: 36,
            height: 36,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center'
          },
          messagePressed && {
            backgroundColor: koolaIconWell[resolvedScheme],
            opacity: koolaOpacity.pressed
          }
        ]}>
        <MaterialIcons
          name="chat-bubble-outline"
          size={20}
          color={tokens.semantic.text.secondary}
        />
      </Pressable>
      <Pressable
        onPress={() => notify()}
        onPressIn={() => setNotificationPressed(true)}
        onPressOut={() => setNotificationPressed(false)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Thông báo"
        style={[
          {
            width: 36,
            height: 36,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center'
          },
          notificationPressed && {
            backgroundColor: koolaIconWell[resolvedScheme],
            opacity: koolaOpacity.pressed
          }
        ]}>
        <MaterialIcons
          name="notifications-none"
          size={20}
          color={tokens.semantic.text.secondary}
        />
      </Pressable>
    </View>
  );

  return (
    <NotchHeader
      style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
      actions={headerActions}
    />
  );
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
  cartBadge: {
    position: 'absolute',
    top: 0,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: { fontSize: 10, lineHeight: 12 },
});

const styles = StyleSheet.create({
  host: { flex: 1 },
  host2: { width: '100%', zIndex: 10 },
});

export default ShoppingTabStack;
