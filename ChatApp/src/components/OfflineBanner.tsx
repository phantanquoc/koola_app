import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  isVisible: boolean;
}

const OfflineBanner: React.FC<Props> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        No internet connection. Messages will be sent when you're back online.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#E0F7FA',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  text: {
    color: '#00695C',
    fontSize: 13,
    textAlign: 'center',
  },
});

export default OfflineBanner;
