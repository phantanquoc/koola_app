import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { conversationsApi } from '../services/api/apiService';
import type { Conversation } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (conversation: Conversation) => void;
}

export const GroupCreateModal: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Group name is required');
      return;
    }

    const ids = memberIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (ids.length < 2) {
      Alert.alert('Error', 'Please add at least 2 members');
      return;
    }

    setLoading(true);
    try {
      const { data } = await conversationsApi.create({
        type: 'group',
        name: name.trim(),
        memberIds: ids,
      });
      onCreated(data);
      setName('');
      setMemberIds('');
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to create group';
      Alert.alert('Error', Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setMemberIds('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create Group</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <Text style={styles.label}>Group name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Team Chat"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
            maxLength={100}
          />

          <Text style={styles.label}>Members (user IDs, comma separated)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="userId1, userId2, userId3..."
            placeholderTextColor="#999"
            value={memberIds}
            onChangeText={setMemberIds}
            multiline
            numberOfLines={3}
          />

          {/* Error hint */}
          <Text style={styles.hint}>Enter at least 2 user IDs separated by commas</Text>

          {/* Button */}
          <TouchableOpacity
            style={[styles.createBtn, loading && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.createBtnText}>Create Group</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  closeBtn: {
    fontSize: 20,
    color: '#999',
    padding: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#1a1a1a',
  },
  multiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
  },
  createBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  createBtnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
