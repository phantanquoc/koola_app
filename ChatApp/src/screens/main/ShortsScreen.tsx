import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { KoolaState, useTheme } from '../../ui';
import type { Palette } from '../../ui/theme';
import { ChatHomeHeaderInsetContext } from './ChatHomeHeaderInsetContext';

const ShortsScreen: React.FC = () => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  // Scene starts at y=0 behind Chat Home's glass header; center below it.
  const headerInset = React.useContext(ChatHomeHeaderInsetContext);

  return (
    <View style={[styles.container, { paddingTop: headerInset }]}>
      <KoolaState
        icon="play-circle-filled"
        title="Video ngắn"
        message="Tính năng đang được phát triển. Khám phá những video ngắn thú vị từ cộng đồng sẽ có sẵn tại đây."
      />
    </View>
  );
};

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.canvas,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

export default ShortsScreen;
