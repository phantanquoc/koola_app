/**
 * OfflineBanner — floating banner shown at the top of the screen when offline.
 * Renders a non-intrusive cyan banner with a connectivity message.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface OfflineBannerProps {
  /** Controls visibility — pass `!isConnected` from useNetworkStatus */
  isVisible: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLabel="No internet connection">
      <Text style={styles.text}>
        No internet connection. Messages will be sent when you're back online.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: '#E0F7FA',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    fontSize: 13,
    color: '#006064',
    textAlign: 'center',
  },
});
