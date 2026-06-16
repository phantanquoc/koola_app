import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaIconButton, KoolaText, koolaColors } from '../ui';

interface KoolaHeaderProps {
  searchPlaceholder?: string;
  onSearchPress?: () => void;
  onQrPress?: () => void;
  onAddPress?: () => void;
}

const Logo: React.FC = () => (
  <KoolaText variant="heading" weight="800" style={styles.logo}>
    <KoolaText variant="heading" weight="800" style={styles.logoBlue}>K</KoolaText>
    <KoolaText variant="heading" weight="800" style={styles.logoGreen}>O</KoolaText>
    <KoolaText variant="heading" weight="800" style={styles.logoWarm}>O</KoolaText>
    <KoolaText variant="heading" weight="800" style={styles.logoBlue}>L</KoolaText>
    <KoolaText variant="heading" weight="800" style={styles.logoGreen}>A</KoolaText>
  </KoolaText>
);

const KoolaHeader: React.FC<KoolaHeaderProps> = ({
  searchPlaceholder = 'Tìm kiếm...',
  onSearchPress,
  onQrPress,
  onAddPress,
}) => {
  const [searchPressed, setSearchPressed] = React.useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.logoRow}>
        <Logo />
      </View>
      <View style={styles.actionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={searchPlaceholder}
          android_ripple={{ color: koolaColors.line }}
          onPress={onSearchPress}
          onPressIn={() => setSearchPressed(true)}
          onPressOut={() => setSearchPressed(false)}
          style={[
            styles.searchBar,
            searchPressed ? styles.searchBarPressed : null,
          ]}>
          <MaterialIcons name="search" size={16} color={koolaColors.muted} />
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: koolaColors.surface,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  logoRow: {
    minHeight: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logo: {
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  logoBlue: {
    color: koolaColors.primary,
  },
  logoGreen: {
    color: koolaColors.accent,
  },
  logoWarm: {
    color: koolaColors.warm,
  },
  searchBar: {
    flex: 1,
    minHeight: 32,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    backgroundColor: koolaColors.canvas,
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
