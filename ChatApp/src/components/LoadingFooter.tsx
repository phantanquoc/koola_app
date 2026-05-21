import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { KoolaText, koolaColors } from '../ui';

interface Props {
  loading: boolean;
  onLoadMore: () => void;
}

const LoadingFooter: React.FC<Props> = ({ loading, onLoadMore }) => {
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={koolaColors.primary} />
      </View>
    );
  }

  return (
    <Pressable style={styles.container} onPress={onLoadMore}>
      <KoolaText tone="primary" weight="800">
        Tải thêm
      </KoolaText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 18,
    alignItems: 'center',
  },
});

export default LoadingFooter;
