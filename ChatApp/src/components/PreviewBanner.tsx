import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaRadii, useTheme } from '../ui';
import type { Palette } from '../ui/theme';

interface PreviewBannerProps {
  /** Optional override message. Defaults to generic preview explanation. */
  message?: string;
}

/**
 * Visible preview/demo indicator banner.
 *
 * Placed at the top of Shopping/Services surfaces to clearly communicate
 * that the content shown is sample data, not a live marketplace.
 * Theme-aware, accessible, and non-interactive.
 */
export const PreviewBanner: React.FC<PreviewBannerProps> = ({
  message = 'Đây là bản xem trước với dữ liệu mẫu. Chức năng mua/đặt hàng chưa khả dụng.',
}) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  return (
    <View
      style={styles.banner}
      accessibilityRole="header"
      accessibilityLabel={`Bản xem trước: ${message}`}>
      <MaterialIcons name="science" size={16} color={palette.warningInk} />
      <KoolaText variant="caption" weight="700" style={styles.text} numberOfLines={2}>
        {message}
      </KoolaText>
    </View>
  );
};

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 8,
      borderRadius: koolaRadii.sm,
      backgroundColor: p.warningSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.warningInk,
    },
    text: {
      flex: 1,
      color: p.warningInk,
      marginLeft: 8,
    },
  });
