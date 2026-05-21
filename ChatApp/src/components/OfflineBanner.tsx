import React from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaColors, koolaRadii } from '../ui';

interface Props {
  isVisible: boolean;
}

const OfflineBanner: React.FC<Props> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <View style={styles.container}>
      <MaterialIcons name="wifi-off" size={17} color={koolaColors.primaryDark} />
      <KoolaText variant="caption" tone="primary" weight="700" style={styles.text}>
        Không có kết nối mạng. Tin nhắn sẽ được gửi khi có mạng trở lại.
      </KoolaText>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: koolaRadii.md,
    backgroundColor: koolaColors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    flex: 1,
    color: koolaColors.primaryDark,
    textAlign: 'center',
  },
});

export default OfflineBanner;
