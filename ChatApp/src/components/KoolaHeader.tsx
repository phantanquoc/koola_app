import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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

interface KoolaHeaderProps {
  searchPlaceholder?: string;
  onSearchPress?: () => void;
  onQrPress?: () => void;
  onAddPress?: () => void;
  logoAnimation?: KoolaLogoAnimation;
  logoReplayKey?: number;
}

const KoolaHeader: React.FC<KoolaHeaderProps> = ({
  searchPlaceholder = 'Tìm người, tin nhắn...',
  onSearchPress,
  onQrPress,
  onAddPress,
  logoAnimation = 'none',
  logoReplayKey = 0,
}) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const [searchPressed, setSearchPressed] = React.useState(false);
  const [qrPressed, setQrPressed] = React.useState(false);
  const [addPressed, setAddPressed] = React.useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.logoRow}>
        <KoolaLogo key={logoReplayKey} showMark={false} variant="extruded" font="sora" wordmarkSize={24} animation={logoAnimation} />
      </View>
      <View style={styles.actionsRow}>
        <View style={styles.commandDock}>
          <HeaderDockChrome
            gradientId="headerCommandFill"
            semantic={tokens.semantic}
            styles={styles}
          />
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
              color={tokens.semantic.text.faint}
              style={styles.searchIcon}
            />
            <KoolaText tone="muted" numberOfLines={1} style={styles.searchText}>
              {searchPlaceholder}
            </KoolaText>
          </Pressable>
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
      paddingBottom: 4,
    },
    logoRow: {
      minHeight: 30,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
    },
    commandDock: {
      flex: 1,
      height: 44,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      backgroundColor: 'transparent',
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 8,
      overflow: 'hidden',
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
