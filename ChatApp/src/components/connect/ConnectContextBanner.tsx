import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

interface ConnectContextBannerProps {
  onCreatePress: () => void;
  onDismiss: () => void;
}

/**
 * First-time context banner for the Connect tab — explains what the tab
 * is for and offers the primary create action. Dismissable.
 */
const ConnectContextBanner: React.FC<ConnectContextBannerProps> = ({
  onCreatePress,
  onDismiss,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <MaterialIcons name="handshake" size={28} color="#1565C0" />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>Khám phá đối tác và nhà cung cấp</Text>
        <Text style={styles.subtitle}>
          Kết nối với doanh nghiệp phù hợp, nhắn tin trực tiếp để hợp tác.
        </Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onCreatePress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Đăng ký doanh nghiệp của bạn">
          <MaterialIcons name="add-business" size={16} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>Đăng ký doanh nghiệp</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={onDismiss}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Đóng gợi ý">
        <MaterialIcons name="close" size={18} color="#6B7280" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  subtitle: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#1565C0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    marginTop: 8,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ConnectContextBanner;
