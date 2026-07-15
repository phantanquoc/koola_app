import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaColors, koolaRadii } from '../../ui';

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
        <MaterialIcons name="handshake" size={28} color={koolaColors.primary} />
      </View>
      <View style={styles.textCol}>
        <KoolaText variant="label" weight="700" style={styles.title}>
          Khám phá đối tác và nhà cung cấp
        </KoolaText>
        <KoolaText variant="caption" tone="muted" style={styles.subtitle}>
          Kết nối với doanh nghiệp phù hợp, nhắn tin trực tiếp để hợp tác.
        </KoolaText>
        <Pressable
          style={styles.primaryBtn}
          onPress={onCreatePress}
          accessibilityRole="button"
          accessibilityLabel="Đăng ký doanh nghiệp của bạn">
          <MaterialIcons name="add-business" size={16} color={koolaColors.surface} />
          <KoolaText variant="caption" weight="700" tone="surface" style={{ marginLeft: 4 }}>
            Đăng ký doanh nghiệp
          </KoolaText>
        </Pressable>
      </View>
      <Pressable
        style={styles.closeBtn}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Đóng gợi ý">
        <MaterialIcons name="close" size={18} color={koolaColors.muted} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: koolaColors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    borderRadius: koolaRadii.md,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: koolaColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textCol: {
    flex: 1,
  },
  title: {
    color: koolaColors.primaryDark,
    marginBottom: 4,
  },
  subtitle: {
    lineHeight: 18,
    marginBottom: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: koolaColors.primary,
    borderRadius: koolaRadii.xs,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    marginTop: 8,
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
