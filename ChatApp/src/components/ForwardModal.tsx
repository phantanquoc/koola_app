import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { conversationsApi, messagesApi } from '../services/api/apiService';
import type { Conversation } from '../types';
import UserAvatar from './UserAvatar';

interface Props {
  visible: boolean;
  messageId: string | null;
  onClose: () => void;
}

const MAX_TARGETS = 10;

const ForwardModal: React.FC<Props> = ({ visible, messageId, onClose }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSelected(new Set());
      setSearch('');
      return;
    }
    setLoading(true);
    conversationsApi.list(1, 50).then((data) => {
      setConversations(data.conversations);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [visible]);

  const filtered = search
    ? conversations.filter((c) => {
        const searchLower = search.toLowerCase();
        // Search by conversation name (group chats)
        if (c.name && c.name.toLowerCase().includes(searchLower)) return true;
        // Search by member displayName (direct chats without name)
        return c.members.some(
          (m) => m.user?.displayName?.toLowerCase().includes(searchLower),
        );
      })
    : conversations;

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_TARGETS) {
          Toast.show({ type: 'info', text1: `Tối đa ${MAX_TARGETS} cuộc trò chuyện`, visibilityTime: 1500 });
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleForward = async () => {
    if (!messageId || selected.size === 0) return;
    setSending(true);
    try {
      await messagesApi.forward(messageId, Array.from(selected));
      Toast.show({ type: 'success', text1: 'Đã chuyển tiếp', visibilityTime: 1500 });
      onClose();
    } catch {
      Toast.show({ type: 'error', text1: 'Chuyển tiếp thất bại', visibilityTime: 2000 });
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: Conversation }) => {
    const isSelected = selected.has(item._id);
    const name = item.name || 'Trò chuyện';
    return (
      <TouchableOpacity style={styles.item} onPress={() => toggleSelect(item._id)}>
        <UserAvatar displayName={name} avatar={item.avatar} size={40} />
        <Text style={styles.itemName} numberOfLines={1}>{name}</Text>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelText}>Hủy</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Chuyển tiếp</Text>
          <TouchableOpacity onPress={handleForward} disabled={selected.size === 0 || sending}>
            <Text style={[styles.sendText, (selected.size === 0 || sending) && styles.disabled]}>
              {sending ? '...' : `Gửi (${selected.size})`}
            </Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.search}
          placeholder="Tìm cuộc trò chuyện..."
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
        />

        {loading ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item._id}
            renderItem={renderItem}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cancelText: { fontSize: 16, color: '#999' },
  title: { fontSize: 18, fontWeight: '600', color: '#333' },
  sendText: { fontSize: 16, color: '#2196F3', fontWeight: '600' },
  disabled: { opacity: 0.4 },
  search: {
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    fontSize: 15,
    color: '#333',
  },
  loader: { marginTop: 40 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  itemName: { flex: 1, fontSize: 16, color: '#333', marginLeft: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});

export default ForwardModal;
