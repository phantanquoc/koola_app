import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  onStartChat: () => void;
}

const EmptyConversations: React.FC<Props> = ({ onStartChat }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>💬</Text>
      <Text style={styles.title}>No conversations yet</Text>
      <Text style={styles.subtitle}>Start chatting with someone!</Text>
      <TouchableOpacity style={styles.button} onPress={onStartChat}>
        <Text style={styles.buttonText}>Start a conversation</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '600', color: '#333', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#999', marginBottom: 24 },
  button: {
    backgroundColor: '#2196F3', paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default EmptyConversations;
