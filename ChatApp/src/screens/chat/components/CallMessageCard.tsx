import React, { useCallback, useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CallLogEntry } from '../../../services/api/apiService';
import { webrtcService } from '../../../services/webrtc/WebRTCService';
import { KoolaText, useTheme } from '../../../ui';
import type { SemanticTokens } from '../../../ui/tokens/semantic';
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

interface Props {
  entry: CallLogEntry;
  currentUserId: string;
  conversationId: string;
  conversationType?: string;
}

const CALL_TIMEOUT_MS = 15000;

const CallMessageCard: React.FC<Props> = ({ entry, currentUserId, conversationId, conversationType }) => {
  const { tokens } = useTheme();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  const isOutgoing = entry.initiatorId === currentUserId;
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
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <View style={styles.topRow}>
          <View style={[styles.iconCircle, { backgroundColor: statusInfo.color + '18' }]}>
            <MaterialIcons name={statusInfo.icon as any} size={18} color={statusInfo.color} />
          </View>
          <View style={styles.textCol}>
            <KoolaText
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
            <MaterialIcons name={entry.callType === 'video' ? 'videocam' : 'call'} size={18} color={tokens.semantic.action.primary} />
          </View>
        </View>
        <View style={styles.divider} />
        <Pressable
          onPress={handleCallAgain}
          accessibilityRole="button"
          accessibilityLabel="GỌI LẠI"
          style={({ pressed }) => [styles.recallBtn, pressed && styles.recallBtnPressed]}
        >
          <KoolaText weight="700" style={{ color: tokens.semantic.action.primary }}>
            GỌI LẠI
          </KoolaText>
        </Pressable>
      </View>
    </View>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    wrapper: {
      alignItems: 'center',
      paddingVertical: 4,
      paddingHorizontal: 16,
    },
    card: {
      minWidth: 260,
      maxWidth: 320,
      width: '78%',
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: semantic.border.subtle,
      padding: 14,
      // shadow for iOS, elevation for Android — subtle like Zalo
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    textCol: {
      flex: 1,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
      flexWrap: 'wrap',
    },
    phoneCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: semantic.action.primary + '14',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 10,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: semantic.border.subtle,
      marginTop: 12,
      marginBottom: 10,
    },
    recallBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 2,
    },
    recallBtnPressed: {
      opacity: 0.6,
    },
  });

export default CallMessageCard;

export { formatDuration, getStatusInfo };
