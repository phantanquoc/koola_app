/**
 * Memoization boundary for GiftedChat.
 *
 * Isolates GiftedChat from parent ChatScreen state changes (typing indicator,
 * context menu, network status) that do not affect message rendering. Without
 * this boundary, every parent re-render pushes render work through GiftedChat's
 * MessageContainer into every visible row, defeating per-message memoization.
 *
 * All props are stable references (useCallback, useMemo, or state that changes
 * only on intentional invalidation). React.memo's default shallow comparison is
 * sufficient — no custom comparator needed.
 */

import React from 'react';
import { GiftedChat, type IMessage, type User } from 'react-native-gifted-chat';
import type { ViewStyle } from 'react-native';

export interface MemoizedMessageListProps {
  messageContainerRef?: React.Ref<any>;
  messages: IMessage[];
  user: User;
  onSend: (messages: IMessage[]) => void;
  onLongPress: (context: unknown, message: IMessage) => void;
  renderMessage: (props: any) => React.ReactElement;
  renderInputToolbar: (props: any) => React.ReactElement;
  renderSystemMessage: (props: any) => React.ReactElement | null;
  renderMessageImage: (props: any) => React.ReactElement | null;
  renderMessageVideo: (props: any) => React.ReactElement | null;
  renderCustomView: (props: any) => React.ReactElement | null;
  renderDay: (props: any) => React.ReactElement | null;
  renderFooter: () => React.ReactElement | null;
  loadEarlier: boolean;
  onLoadEarlier: () => void;
  isLoadingEarlier: boolean;
  bottomOffset: number;
  listViewProps: Record<string, unknown>;
  timeFormat?: string;
  locale?: string;
  showUserAvatar?: boolean;
  showAvatarForEveryMessage?: boolean;
  alwaysShowSend?: boolean;
  infiniteScroll?: boolean;
  minInputToolbarHeight?: number;
}

const MemoizedMessageListImpl: React.FC<MemoizedMessageListProps> = ({
  messageContainerRef,
  messages,
  user,
  onSend,
  onLongPress,
  renderMessage,
  renderInputToolbar,
  renderSystemMessage,
  renderMessageImage,
  renderMessageVideo,
  renderCustomView,
  renderDay,
  renderFooter,
  loadEarlier,
  onLoadEarlier,
  isLoadingEarlier,
  bottomOffset,
  listViewProps,
  timeFormat = 'HH:mm',
  locale = 'vi',
  showUserAvatar = false,
  showAvatarForEveryMessage = false,
  alwaysShowSend = true,
  infiniteScroll = true,
  minInputToolbarHeight = 0,
}) => {
  return (
    <GiftedChat
      messageContainerRef={messageContainerRef as unknown as React.ComponentProps<typeof GiftedChat>['messageContainerRef']}
      messages={messages}
      onSend={onSend}
      user={user}
      renderMessage={renderMessage}
      renderInputToolbar={renderInputToolbar}
      renderSystemMessage={renderSystemMessage}
      renderMessageImage={renderMessageImage}
      renderMessageVideo={renderMessageVideo}
      renderCustomView={renderCustomView}
      renderDay={renderDay}
      timeFormat={timeFormat}
      locale={locale}
      renderFooter={renderFooter}
      showUserAvatar={showUserAvatar}
      showAvatarForEveryMessage={showAvatarForEveryMessage}
      loadEarlier={loadEarlier}
      onLoadEarlier={onLoadEarlier}
      isLoadingEarlier={isLoadingEarlier}
      alwaysShowSend={alwaysShowSend}
      infiniteScroll={infiniteScroll}
      onLongPress={onLongPress}
      bottomOffset={bottomOffset}
      minInputToolbarHeight={minInputToolbarHeight}
      listViewProps={listViewProps as Record<string, unknown>}
    />
  );
};

/**
 * Memoized wrapper around GiftedChat. Re-renders only when props change.
 * Default shallow comparison is sufficient when all props are stable references.
 */
export const MemoizedMessageList = React.memo(MemoizedMessageListImpl);
