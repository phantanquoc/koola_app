import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';

const SplashScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Koola Chat</Text>
      <ActivityIndicator size="large" color="#2196F3" style={styles.spinner} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 24,
  },
  spinner: {
    marginTop: 16,
  },
});

export default SplashScreen;
