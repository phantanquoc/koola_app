import React from 'react';
import { View, ActivityIndicator, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface Props {
  loading: boolean;
  onLoadMore: () => void;
}

const LoadingFooter: React.FC<Props> = ({ loading, onLoadMore }) => {
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#2196F3" />
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.container} onPress={onLoadMore}>
      <Text style={styles.text}>Load more</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: 16, alignItems: 'center' },
  text: { color: '#2196F3', fontSize: 14, fontWeight: '600' },
});

export default LoadingFooter;
