import React from 'react';
import { StyleSheet } from 'react-native';
import { KoolaState } from '../ui';

interface Props {
  onStartChat: () => void;
}

const EmptyConversations: React.FC<Props> = ({ onStartChat }) => {
  return (
    <KoolaState
      icon="chat-bubble-outline"
      title="Chưa có cuộc trò chuyện"
      message="Bắt đầu một cuộc trò chuyện mới để giữ liên lạc với mọi người."
      actionLabel="Bắt đầu trò chuyện"
      onActionPress={onStartChat}
      style={styles.state}
    />
  );
};

const styles = StyleSheet.create({
  state: {
    flex: 1,
  },
});

export default EmptyConversations;
