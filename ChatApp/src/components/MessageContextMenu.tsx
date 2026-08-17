import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import type { IMessage } from 'react-native-gifted-chat';
import Toast from 'react-native-toast-message';
import { translate } from '../services/translation/translationService';
import translationStore from '../services/translation/translationStore';
import {
  getTranslationPrefs,
  hydrateTranslationPrefs,
} from '../services/translation/translationPrefs';

const EMOJIS = ['👍', '❤️', '😆', '😮', '😢', '😠'] as const;

interface Props {
  visible: boolean;
  message: (IMessage & Record<string, unknown>) | null;
  currentUserId: string;
  pinnedMessageIds: string[];
  onClose: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onDeleteForMe: (messageId: string) => void;
  onDeleteForEveryone: (messageId: string) => void;
  onForward: (message: IMessage & Record<string, unknown>) => void;
  onPin: (messageId: string) => void;
  onUnpin: (messageId: string) => void;
  /** Called when user taps "Discard" on a failed send_message bubble */
  onDiscard?: (messageId: string) => void;
}

const MessageContextMenu: React.FC<Props> = ({
  visible,
  message,
  currentUserId,
  pinnedMessageIds,
  onClose,
  onReact,
  onDeleteForMe,
  onDeleteForEveryone,
  onForward,
  onPin,
  onUnpin,
  onDiscard,
}) => {
  if (!visible || !message) return null;

  const isSender = message.user._id === currentUserId;
  const isPinned = pinnedMessageIds.includes(String(message._id));
  const messageAge = Date.now() - new Date(message.createdAt).getTime();
  const canDeleteForEveryone = isSender && messageAge < 24 * 60 * 60 * 1000;
  // Show Discard only for failed send_message rows owned by current user
  const isFailed = message.failed === true && isSender;

  const handleCopy = () => {
    if (message.text) {
      Clipboard.setString(message.text);
      Toast.show({ type: 'success', text1: 'Đã sao chép', visibilityTime: 1500 });
    }
    onClose();
  };

  const handleDeletePress = () => {
    onClose();
    const buttons: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: 'Xóa cho tôi', onPress: () => onDeleteForMe(String(message._id)), style: 'destructive' },
    ];
    if (canDeleteForEveryone) {
      buttons.push({
        text: 'Xóa cho mọi người',
        onPress: () => onDeleteForEveryone(String(message._id)),
        style: 'destructive',
      });
    }
    buttons.push({ text: 'Hủy', style: 'cancel' });

    const { Alert } = require('react-native');
    Alert.alert('Xóa tin nhắn', 'Chọn cách xóa:', buttons);
  };

  return (
    <View style={styles.absoluteFill}>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Bottom sheet */}
      <View style={styles.sheet}>
        {/* Handle bar */}
        <View style={styles.handleBar} />

        {/* Emoji row */}
        <View style={styles.emojiRow}>
          {EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={styles.emojiBtn}
              activeOpacity={0.6}
              onPress={() => {
                onReact(String(message._id), emoji);
                onClose();
              }}>
              <Text style={styles.emojiText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.divider} />

        {/* Translate — only for messages with non-empty text content. Hidden for
            media-only, file, and system messages per message-context-menu spec. */}
        {message.text && !message.system ? (
          <TouchableOpacity
            style={styles.actionRow}
            activeOpacity={0.6}
            onPress={() => {
              const messageId = String(message._id);
              const text = typeof message.text === 'string' ? message.text : '';
              onClose();
              // Ensure prefs are hydrated; getTranslationPrefs returns defaults
              // synchronously even if hydration hasn't resolved yet.
              void hydrateTranslationPrefs();
              const { preferredLanguage } = getTranslationPrefs();
              translationStore.setLoading(messageId);
              translate(text, preferredLanguage)
                .then((result) => {
                  translationStore.setResult(messageId, result.translatedText);
                })
                .catch(() => {
                  translationStore.clear(messageId);
                  Toast.show({
                    type: 'error',
                    text1: 'Không thể dịch, thử lại sau',
                    visibilityTime: 2500,
                  });
                });
            }}>
            <Text style={styles.actionIcon}>🌐</Text>
            <Text style={styles.actionText}>Dịch</Text>
          </TouchableOpacity>
        ) : null}

        {/* Actions */}
        {message.text ? (
          <TouchableOpacity style={styles.actionRow} activeOpacity={0.6} onPress={handleCopy}>
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.actionText}>Sao chép</Text>
          </TouchableOpacity>
        ) : null}

        {!message.system && (
          <TouchableOpacity
            style={styles.actionRow}
            activeOpacity={0.6}
            onPress={() => {
              onClose();
              onForward(message);
            }}>
            <Text style={styles.actionIcon}>↗️</Text>
            <Text style={styles.actionText}>Chuyển tiếp</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.actionRow}
          activeOpacity={0.6}
          onPress={() => {
            if (isPinned) {
              onUnpin(String(message._id));
            } else {
              onPin(String(message._id));
            }
            onClose();
          }}>
          <Text style={styles.actionIcon}>📌</Text>
          <Text style={styles.actionText}>{isPinned ? 'Bỏ ghim' : 'Ghim'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionRow, styles.deleteRow]} activeOpacity={0.6} onPress={handleDeletePress}>
          <Text style={styles.actionIcon}>🗑️</Text>
          <Text style={[styles.actionText, styles.deleteText]}>Xóa</Text>
        </TouchableOpacity>

        {isFailed && onDiscard && (
          <TouchableOpacity
            style={[styles.actionRow, styles.deleteRow]}
            activeOpacity={0.6}
            onPress={() => {
              onClose();
              onDiscard(String(message._id));
            }}>
            <Text style={styles.actionIcon}>✕</Text>
            <Text style={[styles.actionText, styles.deleteText]}>Huỷ gửi (Discard)</Text>
          </TouchableOpacity>
        )}

        {/* Bottom safe area padding */}
        <View style={styles.bottomPad} />
      </View>
    </View>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    width: SCREEN_WIDTH,
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiText: { fontSize: 22 },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginHorizontal: 16 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  actionIcon: { fontSize: 20, marginRight: 14 },
  actionText: { fontSize: 16, color: '#333' },
  deleteRow: {},
  deleteText: { color: '#e53935' },
  bottomPad: { height: 24 },
});

export default MessageContextMenu;
