import React, { useMemo } from 'react';
import { Animated as NativeAnimated, Easing, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { KoolaLogo, KoolaText, useTheme } from '../ui';
import type { KoolaLogoAnimation } from '../ui';
import type { SemanticTokens } from '../ui/tokens/semantic';

export interface HeaderAction {
  icon: string;
  accessibilityLabel: string;
  onPress?: () => void;
  iconSize?: number;
}

interface KoolaHeaderProps {
  searchPlaceholder?: string;
  onSearchPress?: () => void;
  onQrPress?: () => void;
  onAddPress?: () => void;
  logoAnimation?: KoolaLogoAnimation;
  logoReplayKey?: number;
  animatedDockBorder?: boolean;
  trailingActions?: HeaderAction[];
  showBottomHairline?: boolean;
}

const KoolaHeader: React.FC<KoolaHeaderProps> = ({
  searchPlaceholder = 'Tìm kiếm',
  onSearchPress,
  onQrPress,
  onAddPress,
  logoAnimation = 'none',
  logoReplayKey = 0,
  animatedDockBorder = false,
  trailingActions,
  showBottomHairline = false,
}) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const [searchPressed, setSearchPressed] = React.useState(false);
  const [qrPressed, setQrPressed] = React.useState(false);
  const [addPressed, setAddPressed] = React.useState(false);
  const [dockWidth, setDockWidth] = React.useState(0);

  const handleDockLayout = React.useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setDockWidth((prev) => (prev === w ? prev : w));
  }, []);

  return (
    <View style={[styles.container, showBottomHairline && styles.containerHairline]}>
      <View style={styles.headerRow}>
        <View style={styles.logoSlot}>
          <KoolaLogo key={logoReplayKey} showMark={false} variant="extruded" font="sora" wordmarkSize={22} animation={logoAnimation} />
        </View>
        <View style={[styles.commandDock, !animatedDockBorder && styles.commandDockHairline]} onLayout={handleDockLayout}>
          <HeaderDockChrome
            gradientId="headerCommandFill"
            semantic={tokens.semantic}
            styles={styles}
          />
          {animatedDockBorder && (
            <DockAnimatedBorder
              width={dockWidth}
              semantic={tokens.semantic}
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={searchPlaceholder}
            android_ripple={{ color: tokens.semantic.action.primarySoft }}
            hitSlop={{ top: 2, bottom: 2 }}
            onPress={onSearchPress}
            onPressIn={() => setSearchPressed(true)}
            onPressOut={() => setSearchPressed(false)}
            style={[
              styles.searchButton,
              searchPressed ? styles.controlPressed : null,
            ]}>
            <MaterialIcons
              name="search"
              size={20}
              color={tokens.semantic.action.primary}
              style={styles.searchIcon}
            />
            <KoolaText numberOfLines={1} style={[styles.searchText, { color: tokens.semantic.action.primary }]}>
              {searchPlaceholder}
            </KoolaText>
          </Pressable>
          {trailingActions ? (
            trailingActions.map((action, index) => (
              <DockActionButton
                key={action.icon + index}
                action={action}
                semantic={tokens.semantic}
                styles={styles}
              />
            ))
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Quét mã QR"
                android_ripple={{ color: tokens.semantic.action.primarySoft }}
                hitSlop={{ top: 2, bottom: 2 }}
                onPress={onQrPress}
                onPressIn={() => setQrPressed(true)}
                onPressOut={() => setQrPressed(false)}
                style={[
                  styles.actionButton,
                  qrPressed ? styles.controlPressed : null,
                ]}>
                <MaterialIcons
                  name="qr-code-scanner"
                  size={22}
                  color={tokens.semantic.action.primary}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Thêm mới"
                android_ripple={{ color: tokens.semantic.action.primarySoft }}
                hitSlop={{ top: 2, bottom: 2 }}
                onPress={onAddPress}
                onPressIn={() => setAddPressed(true)}
                onPressOut={() => setAddPressed(false)}
                style={[
                  styles.actionButton,
                  addPressed ? styles.controlPressed : null,
                ]}>
                <MaterialIcons
                  name="add-circle-outline"
                  size={24}
                  color={tokens.semantic.action.primary}
                />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
};


const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: {
      // Header sits directly above the white top-tab bar (palette.surface) and
      // white conversation rows (surface.level1). It must be the SAME white to
      // read seamless — the greyish canvas/level0 tokens made it a mismatched
      // grey band. This restores the original white header (koolaColors.surface).
      backgroundColor: semantic.surface.level1,
      paddingHorizontal: 12,
      paddingTop: 6,
      paddingBottom: 6,
    },
    containerHairline: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: semantic.border.subtle,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
    },
    logoSlot: {
      justifyContent: 'center',
      alignItems: 'flex-start',
      marginRight: 10,
      flexShrink: 0,
    },
    commandDock: {
      flex: 1,
      height: 44,
      borderRadius: 16,
      backgroundColor: 'transparent',
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
    },
    commandDockHairline: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
    },
    dockStaticFill: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 16,
      overflow: 'hidden',
    },
    dockTint: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 16,
      backgroundColor: semantic.action.primarySoft,
      opacity: 0.08,
    },
    dockTopSheen: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 17,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      overflow: 'hidden',
    },
    dockEdgeLeft: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      left: 0,
      width: 1,
      backgroundColor: semantic.surface.level1,
      opacity: 0.7,
    },
    dockEdgeRight: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      right: 0,
      width: 1,
      backgroundColor: semantic.surface.level1,
      opacity: 0.7,
    },
    dockInnerEdge: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: semantic.surface.level1,
      opacity: 0.8,
    },
    dockBottomHairline: {
      position: 'absolute',
      bottom: 0,
      left: 10,
      right: 10,
      height: 1,
      backgroundColor: semantic.action.primary,
      opacity: 0.1,
    },
    searchButton: {
      flex: 1,
      height: '100%',
      paddingLeft: 12,
      paddingRight: 10,
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 1,
    },
    actionButton: {
      width: 48,
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    searchIcon: {
      width: 20,
      height: 20,
      lineHeight: 20,
      textAlign: 'center',
      textAlignVertical: 'center',
      includeFontPadding: false,
    },
    controlPressed: {
      backgroundColor: semantic.action.primarySoft,
      opacity: 0.82,
    },
    searchText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      marginLeft: 8,
    },
  });

// ─── Dock action button (per-action press state, avoids array-index bugs) ─────
interface DockActionButtonProps {
  action: HeaderAction;
  semantic: SemanticTokens;
  styles: ReturnType<typeof makeStyles>;
}

const DockActionButton: React.FC<DockActionButtonProps> = ({ action, semantic, styles }) => {
  const [pressed, setPressed] = React.useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
      android_ripple={{ color: semantic.action.primarySoft }}
      hitSlop={{ top: 2, bottom: 2 }}
      onPress={action.onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.actionButton,
        pressed ? styles.controlPressed : null,
      ]}>
      <MaterialIcons
        name={action.icon}
        size={action.iconSize ?? 22}
        color={semantic.action.primary}
      />
    </Pressable>
  );
};

// ─── Animated dock border ──────────────────────────────────────────────────
// A refined brand-gradient stroke (K=red → OOL=blue → A=green, low alpha) that
// mirrors the wordmark beside it, plus a ONE-SHOT light trace that sweeps the
// perimeter once on first appearance. No perpetual loop — same category as
// KoolaLogo entrances.
const AnimatedRect = NativeAnimated.createAnimatedComponent(Rect);

const DOCK_HEIGHT = 44;
const DOCK_RADIUS = 16;
const BORDER_INSET = 1;
const BASE_STROKE = 1.25;
const COMET_STROKE = 2;
const SWEEP_DURATION = 2100;

interface DockAnimatedBorderProps {
  width: number;
  semantic: SemanticTokens;
}

const DockAnimatedBorder: React.FC<DockAnimatedBorderProps> = ({
  width,
  semantic,
}) => {
  const progress = React.useRef(new NativeAnimated.Value(0)).current;
  const hasSweptRef = React.useRef(false);

  // Inner geometry: stroke sits fully inside the overflow:hidden clip.
  const innerW = Math.max(0, width - BORDER_INSET * 2);
  const innerH = DOCK_HEIGHT - BORDER_INSET * 2;
  const r = DOCK_RADIUS - BORDER_INSET;
  // Rounded-rect perimeter: straight runs + one full circle of corners.
  const perimeter = 2 * (innerW - 2 * r) + 2 * (innerH - 2 * r) + 2 * Math.PI * r;
  const cometLen = Math.max(48, perimeter * 0.22);

  React.useEffect(() => {
    if (width <= 0 || hasSweptRef.current) return;
    hasSweptRef.current = true;
    progress.setValue(0);
    const anim = NativeAnimated.timing(progress, {
      toValue: 1,
      duration: SWEEP_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // strokeDashoffset/opacity are SVG props
    });
    anim.start();
    return () => anim.stop();
  }, [width, progress]);

  if (width <= 0) return null;

  // The bright segment travels one full lap, then fades as it lands.
  const dashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [cometLen, -perimeter],
  });
  const cometOpacity = progress.interpolate({
    inputRange: [0, 0.08, 0.82, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <SvgLinearGradient id="dockBorderBrand" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={semantic.brand.red} stopOpacity="0.55" />
            <Stop offset="0.5" stopColor={semantic.brand.blue} stopOpacity="0.6" />
            <Stop offset="1" stopColor={semantic.brand.green} stopOpacity="0.55" />
          </SvgLinearGradient>
        </Defs>
        {/* Resting brand-gradient border — always visible */}
        <Rect
          x={BORDER_INSET}
          y={BORDER_INSET}
          width={innerW}
          height={innerH}
          rx={r}
          ry={r}
          fill="none"
          stroke="url(#dockBorderBrand)"
          strokeWidth={BASE_STROKE}
        />
        {/* One-shot light trace */}
        <AnimatedRect
          x={BORDER_INSET}
          y={BORDER_INSET}
          width={innerW}
          height={innerH}
          rx={r}
          ry={r}
          fill="none"
          stroke={semantic.action.primary}
          strokeWidth={COMET_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${cometLen}, ${perimeter}`}
          strokeDashoffset={dashOffset}
          opacity={cometOpacity}
        />
      </Svg>
    </View>
  );
};

interface HeaderDockChromeProps {
  gradientId: string;
  semantic: SemanticTokens;
  styles: ReturnType<typeof makeStyles>;
}

const HeaderDockChrome: React.FC<HeaderDockChromeProps> = ({
  gradientId,
  semantic,
  styles,
}) => (
  <>
    <View pointerEvents="none" style={styles.dockStaticFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={semantic.surface.level1} stopOpacity="0.94" />
            <Stop offset="0.56" stopColor={semantic.surface.level0} stopOpacity="0.88" />
            <Stop offset="1" stopColor={semantic.action.primarySoft} stopOpacity="0.3" />
          </SvgLinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
    <View pointerEvents="none" style={styles.dockTint} />
    <View pointerEvents="none" style={styles.dockTopSheen}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id={`${gradientId}Sheen`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={semantic.surface.level1} stopOpacity="0.52" />
            <Stop offset="1" stopColor={semantic.surface.level1} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId}Sheen)`} />
      </Svg>
    </View>
    <View pointerEvents="none" style={styles.dockEdgeLeft} />
    <View pointerEvents="none" style={styles.dockEdgeRight} />
    <View pointerEvents="none" style={styles.dockInnerEdge} />
    <View pointerEvents="none" style={styles.dockBottomHairline} />
  </>
);

export default KoolaHeader;
