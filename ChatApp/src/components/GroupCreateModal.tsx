import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { conversationsApi } from '../services/api/apiService';
import type { Conversation } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (conversation: Conversation) => void;
}

const GroupCreateModal: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }
    if (!memberIds.trim()) {
      Alert.alert('Error', 'Please enter at least one member ID');
      return;
    }

    const ids = memberIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      Alert.alert('Error', 'Please enter valid member IDs');
      return;
    }

    setLoading(true);
    try {
      const { conversation } = await conversationsApi.createGroup(
        name.trim(),
        ids,
      );
      onCreated(conversation);
      setName('');
      setMemberIds('');
      onClose();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      Alert.alert(
        'Error',
        error.response?.data?.message || 'Failed to create group',
      );
    } finally {
      setLoading(false);
    }
  };

  // Fabric-safe: do not mount native <Modal> (Dialog Window) until visible.
  // Eager mount with visible=false races RN's removeViewAt on Android Fabric.
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Group</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Group name"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Member IDs (comma separated)"
            placeholderTextColor="#999"
            value={memberIds}
            onChangeText={setMemberIds}
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.createButton, loading && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.createButtonText}>Create Group</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  closeButton: { fontSize: 20, color: '#999', padding: 4 },
  input: {
    height: 48, borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 16, fontSize: 16, marginBottom: 12, color: '#333',
  },
  createButton: {
    height: 48, backgroundColor: '#2196F3', borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default GroupCreateModal;
