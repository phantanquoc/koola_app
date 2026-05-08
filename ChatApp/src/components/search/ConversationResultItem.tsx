import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import UserAvatar from '../UserAvatar';
import type { Conversation } from '../../types';

interface Props {
  conversation: Conversation;
  displayName: string;
  avatar?: string;
  onPress: () => void;
}

const ConversationResultItem: React.FC<Props> = ({
  conversation,
  displayName,
  avatar,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Mở cuộc trò chuyện với ${displayName}`}>
      <UserAvatar displayName={displayName} avatar={avatar} size={44} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        {conversation.lastMessagePreview ? (
          <Text style={styles.preview} numberOfLines={1}>
            {conversation.lastMessagePreview}
          </Text>
        ) : null}
      </View>
      {conversation.type === 'group' ? (
        <Text style={styles.tag}>Nhóm</Text>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  preview: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  tag: {
    fontSize: 11,
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
});

export default ConversationResultItem;
