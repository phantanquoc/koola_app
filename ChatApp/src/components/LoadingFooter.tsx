import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ActivityIndicator } from 'react-native';

interface Props {
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export const LoadingFooter: React.FC<Props> = ({ loading, hasMore, onLoadMore }) => {
  if (!hasMore) return null;

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="small" color="#007AFF" />
      ) : (
        <TouchableOpacity onPress={onLoadMore}>
          <Text style={styles.text}>Load more</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  text: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
});
