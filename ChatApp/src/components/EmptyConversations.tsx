import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

interface Props {
  onCreateGroup: () => void;
}

export const EmptyConversations: React.FC<Props> = ({ onCreateGroup }) => (
  <View style={styles.container}>
    <MaterialIcons name="chat-bubble-outline" size={64} color="#ddd" />
    <Text style={styles.title}>No conversations yet</Text>
    <Text style={styles.subtitle}>Start a conversation with someone</Text>
    <TouchableOpacity style={styles.button} onPress={onCreateGroup}>
      <Text style={styles.buttonText}>Create Group</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  button: {
    marginTop: 24,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
