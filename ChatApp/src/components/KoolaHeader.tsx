import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaIconButton, KoolaLogo, KoolaText, useTheme } from '../ui';
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
  searchPlaceholder = 'Tìm kiếm...',
  onSearchPress,
  onQrPress,
  onAddPress,
  logoAnimation = 'none',
  logoReplayKey = 0,
}) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const [searchPressed, setSearchPressed] = React.useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.logoRow}>
        <KoolaLogo key={logoReplayKey} showMark={false} variant="extruded" font="sora" wordmarkSize={24} animation={logoAnimation} />
      </View>
      <View style={styles.actionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={searchPlaceholder}
          android_ripple={{ color: tokens.semantic.border.subtle }}
          onPress={onSearchPress}
          onPressIn={() => setSearchPressed(true)}
          onPressOut={() => setSearchPressed(false)}
          style={[
            styles.searchBar,
            searchPressed ? styles.searchBarPressed : null,
          ]}>
          <MaterialIcons name="search" size={16} color={tokens.semantic.text.faint} />
          <KoolaText tone="muted" numberOfLines={1} style={styles.searchText}>
            {searchPlaceholder}
          </KoolaText>
        </Pressable>
        <KoolaIconButton
          icon="qr-code-scanner"
          tone="primary"
          variant="soft"
          size={32}
          iconSize={18}
          onPress={onQrPress}
          accessibilityLabel="Quét mã QR"
        />
        <KoolaIconButton
          icon="add"
          tone="surface"
          variant="solid"
          size={32}
          iconSize={18}
          onPress={onAddPress}
          accessibilityLabel="Thêm mới"
        />
      </View>
    </View>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: {
      backgroundColor: semantic.surface.level0,
      paddingHorizontal: 12,
      paddingTop: 6,
      paddingBottom: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: semantic.border.subtle,
    },
    logoRow: {
      minHeight: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    searchBar: {
      flex: 1,
      minHeight: 32,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 16,
      backgroundColor: semantic.bg.canvas,
    },
    searchBarPressed: {
      opacity: 0.78,
    },
    searchText: {
      flex: 1,
      fontSize: 12,
    },
  });

export default KoolaHeader;
