import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import UserAvatar from '../../../components/UserAvatar';
import {
  KoolaText,
  KoolaIconButton,
  koolaColors,
  koolaRadii,
  koolaSpacing,
} from '../../../ui';

type CallType = 'audio' | 'video';

interface ChatHeaderProps {
  chatTitle: string;
  otherUserStatus: string | null;
  otherAvatarKey: string;
  onBack: () => void;
  onHeaderPress: () => void;
  onStartCall: (callType: CallType) => void;
}

/**
 * Presentational chat header: back button, avatar + title + online status
 * (tap → profile/group info), and the audio/video call actions.
 *
 * Stateless — all data and callbacks are injected. State + behaviour live in
 * useChatHeaderState (title/status/avatar/header tap) and useCallInitiation
 * (start call).
 */
const ChatHeader: React.FC<ChatHeaderProps> = ({
  chatTitle,
  otherUserStatus,
  otherAvatarKey,
  onBack,
  onHeaderPress,
  onStartCall,
}) => {
  return (
    <View style={styles.header}>
      <KoolaIconButton
        icon="arrow-back"
        tone="primary"
        variant="ghost"
        size={40}
        iconSize={24}
        onPress={onBack}
        accessibilityLabel="Quay lại"
      />
      <TouchableOpacity style={styles.headerCenter} onPress={onHeaderPress} activeOpacity={0.8}>
        <View>
          <UserAvatar displayName={chatTitle} avatar={otherAvatarKey || undefined} size={38} />
          {otherUserStatus === 'Đang hoạt động' && (
            <View style={styles.onlineDot} accessibilityElementsHidden importantForAccessibility="no" />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <KoolaText variant="label" tone="ink" weight="600" numberOfLines={1}>{chatTitle}</KoolaText>
          <KoolaText
            variant="caption"
            tone={otherUserStatus === 'Đang hoạt động' ? 'success' : 'muted'}
            numberOfLines={1}
            style={otherUserStatus ? undefined : { opacity: 0 }}>
            {otherUserStatus || 'placeholder'}
          </KoolaText>
        </View>
      </TouchableOpacity>
      <View style={styles.headerRight}>
        <KoolaIconButton
          icon="call"
          tone="primary"
          variant="soft"
          size={40}
          iconSize={22}
          onPress={() => onStartCall('audio')}
          accessibilityLabel="Gọi thoại"
        />
        <KoolaIconButton
          icon="videocam"
          tone="primary"
          variant="soft"
          size={40}
          iconSize={22}
          onPress={() => onStartCall('video')}
          accessibilityLabel="Gọi video"
        />
      </View>
    </View>
  );
};

export default ChatHeader;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: koolaSpacing.lg,
    paddingTop: koolaSpacing.sm, paddingBottom: koolaSpacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: koolaColors.line,
    backgroundColor: koolaColors.surface,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: koolaSpacing.sm, marginLeft: koolaSpacing.xs },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: koolaSpacing.xs },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: koolaRadii.pill,
    backgroundColor: koolaColors.accent,
    borderWidth: 2, borderColor: koolaColors.surface,
  },
});
