import React, { useCallback, useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { IMessage } from 'react-native-gifted-chat';
import type { CallLogEntry } from '../../../services/api/apiService';
import UserAvatar from '../../../components/UserAvatar';
import { webrtcService } from '../../../services/webrtc/WebRTCService';
import { KoolaText, useTheme } from '../../../ui';
import type { SemanticTokens } from '../../../ui/tokens/semantic';
import type { ComponentTokens } from '../../../ui/tokens/components';
import { formatRelativeTimestamp } from '../../../utils/formatViTimestamp';
import type { RootStackParamList } from '../../../navigation/types';

/** mm:ss, same as ConversationCallHistorySheet */
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getStatusInfo(
  status: CallLogEntry['status'],
  isOutgoing: boolean,
  semantic: SemanticTokens,
): { icon: string; color: string; label: string } {
  switch (status) {
    case 'ended':
    case 'answered':
      return {
        icon: isOutgoing ? 'call-made' : 'call-received',
        color: semantic.status.success,
        label: 'Đã kết thúc',
      };
    case 'missed':
      return {
        icon: 'call-missed',
        color: semantic.status.danger,
        label: isOutgoing ? 'Không trả lời' : 'Bạn bị nhỡ',
      };
    case 'declined':
      return {
        icon: 'call-missed',
        color: semantic.status.warning,
        label: isOutgoing ? 'Bị từ chối' : 'Đã từ chối',
      };
    case 'cancelled':
      return {
        icon: 'call-missed-outgoing',
        color: semantic.text.faint,
        label: 'Đã hủy',
      };
    case 'busy':
      return { icon: 'phone-missed', color: semantic.status.warning, label: 'Đang bận' };
    case 'failed':
      return { icon: 'error-outline', color: semantic.status.danger, label: 'Thất bại' };
    default:
      return { icon: 'call', color: semantic.text.faint, label: status };
  }
}

function buildTitle(
  entry: CallLogEntry,
  isOutgoing: boolean,
  semantic: SemanticTokens,
): { title: string; color?: string } {
  const isMissedIncoming = !isOutgoing && entry.status === 'missed';
  if (isMissedIncoming) {
    // Zalo style: "Bạn bị nhỡ Cuộc gọi video 22 phút 1 giây" — here simplified with icon + red
    const kind = entry.callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
    return { title: `Bạn bị nhỡ ${kind}`, color: semantic.status.danger };
  }
  // Ended/answered/missed-outgoing: use status label + direction hint
  const kind = entry.callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
  const dir = isOutgoing ? 'đi' : 'đến';
  const info = getStatusInfo(entry.status, isOutgoing, semantic);
  // For ended/answered show "Cuộc gọi video đi/đến", otherwise show status label
  if (entry.status === 'ended' || entry.status === 'answered') {
    return { title: `${kind} ${dir}` };
  }
  return { title: info.label };
}

/**
 * Consecutive-run grouping, mirroring MessageItem.isLastInGroup so call cards
 * cluster the same way text bubbles do. GiftedChat renders an inverted list, so
 * `nextMessage` is the NEWER item drawn below this one; a row is the "last in
 * run" (the one that keeps the avatar) when nextMessage is absent or belongs to
 * a different sender. The grouping key for a call is its initiatorId — exactly
 * what ChatScreen stores in `user._id` for the merged timeline item — which for
 * incoming calls is also the avatar owner. No time threshold: text bubbles group
 * purely by sender regardless of gap, so call cards must too or they'd cluster
 * differently from the surrounding bubbles.
 */
function isLastInCluster(
  currentSenderId: string,
  next: (IMessage & { __callEntry?: CallLogEntry }) | null | undefined,
): boolean {
  if (!next || !next.user) return true;
  return next.user._id !== currentSenderId;
}

interface Props {
  entry: CallLogEntry;
  currentUserId: string;
  conversationId: string;
  conversationType?: string;
  otherAvatarKey?: string | null;
  otherDisplayName?: string | null;
  /**
   * The timeline item rendered directly below this card (GiftedChat's
   * `nextMessage`), used to decide whether this card is the last of a
   * consecutive same-sender run and therefore the one that shows the avatar.
   * Works whether the neighbour is a text bubble or another call card.
   */
  nextMessage?: (IMessage & { __callEntry?: CallLogEntry }) | null;
}

const CALL_TIMEOUT_MS = 15000;

const CallMessageCard: React.FC<Props> = ({ entry, currentUserId, conversationId, conversationType, otherAvatarKey, otherDisplayName, nextMessage }) => {
  const { tokens } = useTheme();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = useMemo(
    () => makeStyles(tokens.semantic, tokens.component),
    [tokens.semantic, tokens.component],
  );

  const isOutgoing = entry.initiatorId === currentUserId;
  // Match MessageItem's cluster rule: incoming avatars only on the last of
  // a consecutive same-sender run, where "last" means the NEWER neighbour
  // (GiftedChat's nextMessage in the inverted list) has a different sender.
  const currentSenderId = entry.initiatorId;
  const isLastInRun = isLastInCluster(currentSenderId, nextMessage);
  const showIncomingAvatar = !isOutgoing && isLastInRun;
  const durationText = formatDuration(entry.duration);
  const timeAgo = formatRelativeTimestamp(entry.startedAt);
  const isMissedIncoming = !isOutgoing && entry.status === 'missed';
  const titleInfo = buildTitle(entry, isOutgoing, tokens.semantic);
  const statusInfo = getStatusInfo(entry.status, isOutgoing, tokens.semantic);

  const handleCallAgain = useCallback(() => {
    if (conversationType === 'group') {
      Alert.alert('Thông báo', 'Gọi nhóm đang phát triển');
      return;
    }
    if (!webrtcService.isConnected()) {
      Alert.alert('Lỗi', 'Chưa kết nối, vui lòng thử lại.');
      return;
    }
    const otherUserId = isOutgoing ? entry.targetUserId : entry.initiatorId;

    let settled = false;
    const cleanup = () => {
      webrtcService.off('call_initiated', onInitiated);
      webrtcService.off('call_busy', onBusy);
      webrtcService.off('call_missed', onMissed);
      webrtcService.off('error', onError);
      clearTimeout(timer);
    };
    const onInitiated = (data: unknown) => {
      if (settled) return;
      settled = true;
      const d = data as { sessionId?: string; iceServers?: { urls: string; username?: string; credential?: string }[] };
      cleanup();
      if (!d.sessionId) {
        Alert.alert('Lỗi', 'Không thể khởi tạo cuộc gọi');
        return;
      }
      const remoteUserId = otherUserId;
      const remoteName = isOutgoing ? (entry.targetName || 'User') : (entry.initiatorName || 'User');
      const remoteAvatar = isOutgoing ? entry.targetAvatar : entry.initiatorAvatar;
      rootNav.navigate('CallModal', {
        sessionId: d.sessionId,
        callType: entry.callType,
        isInitiator: true,
        iceServers: d.iceServers,
        remoteUser: { id: remoteUserId, displayName: remoteName, avatar: remoteAvatar },
      });
    };
    const onBusy = () => {
      if (settled) return;
      settled = true;
      cleanup();
      Alert.alert('Bận', 'Người dùng đang bận.');
    };
    const onMissed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      Alert.alert('Không trả lời', 'Người dùng hiện không trực tuyến.');
    };
    const onError = (data: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      const msg = (data as { message?: string })?.message || 'Cuộc gọi thất bại';
      Alert.alert('Lỗi', msg);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      Alert.alert('Hết thời gian', 'Máy chủ không phản hồi.');
    }, CALL_TIMEOUT_MS);

    webrtcService.on('call_initiated', onInitiated);
    webrtcService.on('call_busy', onBusy);
    webrtcService.on('call_missed', onMissed);
    webrtcService.on('error', onError);

    webrtcService.initiateCall(otherUserId, conversationId, entry.callType);
  }, [conversationType, entry, isOutgoing, conversationId, rootNav]);

  return (
    <View style={[styles.wrapper, isOutgoing ? styles.wrapperOutgoing : styles.wrapperIncoming]}>
      {/* Avatar only on the last card of an incoming same-sender cluster —
          same rule as MessageItem's text-bubble grouping. Grouped cards keep
          an invisible spacer so the cluster's left edges stay aligned, just
          like the constant incoming gutter on text bubbles. */}
      {!isOutgoing && showIncomingAvatar && (
        <UserAvatar
          displayName={otherDisplayName ?? entry.initiatorName ?? 'User'}
          avatar={otherAvatarKey ?? entry.initiatorAvatar}
          size={28}
          style={styles.incomingAvatar}
        />
      )}
      {!isOutgoing && !showIncomingAvatar && <View style={styles.incomingAvatarSpacer} />}
      <View style={[styles.card, isOutgoing ? styles.cardOutgoing : styles.cardIncoming]}>
        <View style={styles.topRow}>
          <View style={[styles.iconCircle, { backgroundColor: statusInfo.color + '18' }]}>
            <MaterialIcons name={statusInfo.icon as any} size={14} color={statusInfo.color} />
          </View>
          <View style={styles.textCol}>
            <KoolaText
              variant="label"
              weight={isMissedIncoming ? '600' : '500'}
              style={titleInfo.color ? { color: titleInfo.color } : undefined}
            >
              {titleInfo.title}
            </KoolaText>
            <View style={styles.metaRow}>
              <KoolaText variant="caption" tone="muted">
                {timeAgo}
              </KoolaText>
              {!!durationText && (
                <KoolaText variant="caption" tone="muted">
                  {'  '}· {durationText}
                </KoolaText>
              )}
            </View>
          </View>
          <View style={styles.phoneCircle}>
            <MaterialIcons name={entry.callType === 'video' ? 'videocam' : 'call'} size={14} color={tokens.semantic.action.primary} />
          </View>
        </View>
        <View style={styles.divider} />
        <Pressable
          onPress={handleCallAgain}
          accessibilityRole="button"
          accessibilityLabel="GỌI LẠI"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [styles.recallBtn, pressed && styles.recallBtnPressed]}
        >
          <KoolaText variant="label" weight="700" style={{ color: tokens.semantic.action.primary }}>
            GỌI LẠI
          </KoolaText>
        </Pressable>
      </View>
    </View>
  );
};

const makeStyles = (semantic: SemanticTokens, component: ComponentTokens) =>
  StyleSheet.create({
    wrapper: {
      flexDirection: 'row',
      paddingVertical: 4,
      paddingHorizontal: 12,
    },
    wrapperOutgoing: {
      justifyContent: 'flex-end',
    },
    wrapperIncoming: {
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
    },
    incomingAvatar: {
      marginRight: 6,
      marginBottom: 2,
    },
    incomingAvatarSpacer: {
      width: 28,
      marginRight: 6,
    },
    card: {
      minWidth: 140,
      maxWidth: 190,
      width: '46%',
      borderRadius: 8,
      padding: 8,
      // shadow for iOS, elevation for Android — subtle, scaled down with card
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
    cardOutgoing: {
      backgroundColor: component.chatBubble.own.bg,
      borderWidth: 0,
      borderColor: 'transparent',
    },
    cardIncoming: {
      backgroundColor: component.chatBubble.other.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconCircle: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 6,
    },
    textCol: {
      flex: 1,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 1,
      flexWrap: 'wrap',
    },
    phoneCircle: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: semantic.action.primary + '14',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 6,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: semantic.border.subtle,
      marginTop: 6,
      marginBottom: 5,
    },
    recallBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 28,
      paddingVertical: 4,
    },
    recallBtnPressed: {
      opacity: 0.6,
    },
  });

export default CallMessageCard;

export { formatDuration, getStatusInfo };
