import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { IMessage } from 'react-native-gifted-chat';
import type { Conversation } from '../../../types';

interface Props {
  message: IMessage & Record<string, unknown>;
  conversation: Conversation | null;
  currentUserId: string;
  onCancel: () => void;
}

/**
 * Task 4.5: Composer banner shown when replying to a message.
 * Shows "Đang trả lời {displayName}" + preview text or media label + cancel (X).
 */
const ReplyPreview: React.FC<Props> = ({ message, conversation, currentUserId, onCancel }) => {
  const senderId = String(message.user?._id || '');

  const getDisplayName = (): string => {
    if (senderId === currentUserId) return 'Bạn';
    if (conversation) {
      const member = conversation.members.find((m) => {
        const id = typeof m.userId === 'object' ? (m.userId as any)._id : m.userId;
        return id === senderId;
      });
      if (member?.user?.displayName) return member.user.displayName;
    }
    return 'Người dùng';
  };

  const getPreviewText = (): string => {
    const mediaType = message.mediaType as string | undefined;
    if (mediaType === 'image') return '📷 Hình ảnh';
    if (mediaType === 'video') return '🎬 Video';
    if (mediaType === 'file') return '📄 Tệp đính kèm';
    if (mediaType === 'voice') return '🎤 Tin nhắn thoại';
    return (message.text as string) || '';
  };

  return (
    <View style={styles.container}>
      <View style={styles.accent} />
      <View style={styles.content}>
        <Text style={styles.label} numberOfLines={1}>
          Đang trả lời {getDisplayName()}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {getPreviewText()}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onCancel}
        style={styles.cancelButton}
        accessibilityRole="button"
        accessibilityLabel="Hủy trả lời">
        <MaterialIcons name="close" size={20} color="#666" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F4FF',
    borderTopWidth: 1,
    borderTopColor: '#E0E8FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  accent: {
    width: 3,
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 2,
    marginRight: 8,
    minHeight: 32,
  },
  content: { flex: 1 },
  label: { fontSize: 12, fontWeight: '600', color: '#2196F3', marginBottom: 2 },
  preview: { fontSize: 13, color: '#555' },
  cancelButton: { padding: 4, marginLeft: 8 },
});

export default ReplyPreview;
