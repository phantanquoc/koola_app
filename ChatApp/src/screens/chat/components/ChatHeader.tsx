import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import UserAvatar from '../../../components/UserAvatar';
import {
  KoolaText,
  KoolaIconButton,
  koolaRadii,
  koolaSpacing,
  koolaShadows,
  koolaDarkShadows,
  useTheme,
} from '../../../ui';
import type { SemanticTokens } from '../../../ui/tokens/semantic';

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
 * (tap -> profile/group info), and the audio/video call actions.
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
  const { tokens, resolvedScheme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(tokens.semantic, resolvedScheme), [tokens.semantic, resolvedScheme]);

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <KoolaIconButton
        icon="arrow-back"
        tone="primary"
        variant="ghost"
        size={40}
        iconSize={24}
        onPress={onBack}
        accessibilityLabel="Quay lại"
      />
      <TouchableOpacity
        style={styles.headerCenter}
        onPress={onHeaderPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Xem thông tin ${chatTitle}`}>
        <View>
          <UserAvatar displayName={chatTitle} avatar={otherAvatarKey || undefined} size={38} />
          {otherUserStatus === 'Đang hoạt động' && (
            <View style={styles.onlineDot} accessibilityElementsHidden importantForAccessibility="no" />
          )}
        </View>
        <View style={{ flex: 1, marginLeft: koolaSpacing.sm }}>
          <KoolaText variant="label" tone="ink" weight="600" numberOfLines={1}>{chatTitle}</KoolaText>
          {/* Fixed minHeight replaces old opacity:0 hack — always reserves space
              for the status line to prevent layout shift on late status arrival */}
          <View style={styles.statusLine}>
            {otherUserStatus ? (
              <KoolaText
                variant="caption"
                tone={otherUserStatus === 'Đang hoạt động' ? 'success' : 'muted'}
                numberOfLines={1}>
                {otherUserStatus}
              </KoolaText>
            ) : null}
          </View>
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

function makeStyles(semantic: SemanticTokens, scheme: 'light' | 'dark') {
  const shadow = scheme === 'dark' ? koolaDarkShadows.xs : koolaShadows.xs;
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: koolaSpacing.lg,
      paddingTop: koolaSpacing.sm,
      paddingBottom: koolaSpacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: semantic.border.subtle,
      backgroundColor: semantic.surface.level1,
      ...shadow,
    },
    headerCenter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: koolaSpacing.xs,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: koolaSpacing.xs,
    },
    statusLine: {
      minHeight: 16,
      justifyContent: 'center',
    },
    onlineDot: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 11,
      height: 11,
      borderRadius: koolaRadii.pill,
      backgroundColor: semantic.status.success,
      borderWidth: 2,
      borderColor: semantic.surface.level1,
    },
  });
}
