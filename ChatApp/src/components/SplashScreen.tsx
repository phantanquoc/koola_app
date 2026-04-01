import React from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';

export const SplashScreen: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.title}>ChatApp</Text>
    <ActivityIndicator size="large" color="#007AFF" style={styles.spinner} />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#007AFF', marginBottom: 24 },
  spinner: { marginTop: 16 },
});
