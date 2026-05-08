import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

interface KoolaHeaderProps {
  searchPlaceholder?: string;
  onSearchPress?: () => void;
  onQrPress?: () => void;
  onAddPress?: () => void;
}

const BRAND_BLUE = '#3B5DC9';

const KoolaHeader: React.FC<KoolaHeaderProps> = ({
  searchPlaceholder = 'Tìm kiếm...',
  onSearchPress,
  onQrPress,
  onAddPress,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>
        <Text style={styles.logoBlue}>K</Text>
        <Text style={styles.logoGreen}>O</Text>
        <Text style={styles.logoRed}>O</Text>
        <Text style={styles.logoBlue}>L</Text>
        <Text style={styles.logoGreen}>A</Text>
      </Text>

      <View style={styles.searchRow}>
        <TouchableOpacity
          style={styles.searchBar}
          onPress={onSearchPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Mở tìm kiếm">
          <MaterialIcons name="search" size={20} color="#9CA3AF" />
          <Text style={styles.searchText}>{searchPlaceholder}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onQrPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Quét mã QR">
          <MaterialIcons name="qr-code-scanner" size={22} color={BRAND_BLUE} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onAddPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Thêm mới">
          <MaterialIcons name="add" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    paddingTop: (StatusBar.currentHeight || 0) + 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  logo: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 10,
  },
  logoBlue: {
    color: BRAND_BLUE,
    fontSize: 24,
    fontWeight: '800',
  },
  logoGreen: {
    color: '#2E9E5A',
    fontSize: 24,
    fontWeight: '800',
  },
  logoRed: {
    color: '#E05A2D',
    fontSize: 24,
    fontWeight: '800',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F1F5',
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 40,
    gap: 8,
  },
  searchText: {
    fontSize: 14,
    color: '#9CA3AF',
    flex: 1,
  },
  iconButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default KoolaHeader;
