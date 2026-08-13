import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../ui';

/**
 * Infinite-scroll footer: a pure centered loading indicator. The list drives
 * pagination itself via onEndReached, so there is no manual "load more" button.
 */
const LoadingFooter: React.FC = () => {
  const { tokens } = useTheme();

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={tokens.semantic.action.primary} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 18,
    alignItems: 'center',
  },
});

export default LoadingFooter;
