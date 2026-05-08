import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

interface PlaceholderScreenProps {
  title: string;
  icon?: string;
}

const PlaceholderScreen: React.FC<PlaceholderScreenProps> = ({ title, icon = 'construction' }) => {
  return (
    <View style={styles.container}>
      <MaterialIcons name={icon} size={64} color="#ccc" />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Tính năng đang phát triển</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
  },
});

export default PlaceholderScreen;
