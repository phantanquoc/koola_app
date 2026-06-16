import React from 'react';
import { StyleSheet, View } from 'react-native';
import { KoolaState, koolaColors } from '../../ui';

const ShortsScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <KoolaState
        icon="play-circle-filled"
        title="Video ngắn"
        message="Tính năng đang được phát triển. Khám phá những video ngắn thú vị từ cộng đồng sẽ có sẵn tại đây."
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ShortsScreen;
