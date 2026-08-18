import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { BottomSheetModal, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { callLogsApi } from '../services/api/apiService';
import type { CallLogEntry } from '../services/api/apiService';
import { webrtcService } from '../services/webrtc/WebRTCService';
import { useAuth } from '../contexts/AuthContext';
import UserAvatar from './UserAvatar';
import { KoolaText, KoolaEmptyState, useTheme } from '../ui';
import type { SemanticTokens } from '../ui/tokens/semantic';
import type { RootStackParamList } from '../navigation/types';
import { formatRelativeTimestamp } from '../utils/formatViTimestamp';

interface Props {
  conversationId: string | null;
  isVisible: boolean;
  onClose: () => void;
}

const PAGE_LIMIT = 20;
const SNAP_POINTS = ['60%', '90%'];

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
        label: isOutgoing ? 'Không trả lời' : 'Cuộc gọi nhỡ',
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
        label: isOutgoing ? 'Đã hủy' : 'Đã hủy',
      };
    case 'busy':
      return { icon: 'phone-missed', color: semantic.status.warning, label: 'Đang bận' };
    case 'failed':
      return { icon: 'error-outline', color: semantic.status.danger, label: 'Thất bại' };
    default:
      return { icon: 'call', color: semantic.text.faint, label: status };
  }
}

const ConversationCallHistorySheet: React.FC<Props> = ({ conversationId, isVisible, onClose }) => {
  const { user } = useAuth();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tokens } = useTheme();
  const sheetRef = useRef<React.ElementRef<typeof BottomSheetModal>>(null);
  const currentUserId = user?._id;

  const [logs, setLogs] = useState<CallLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(1);

  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  const fetchLogs = useCallback(
    async (reset = false) => {
      if (!conversationId) return;
      const targetPage = reset ? 1 : pageRef.current;
      if (reset) setRefreshing(true);
      else setLoading(true);
      try {
        const data = await callLogsApi.getHistory({
          conversationId,
          page: targetPage,
          limit: PAGE_LIMIT,
        });
        if (reset) {
          setLogs(data.items);
          pageRef.current = 2;
        } else {
          setLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l._id));
            const newItems = data.items.filter((l) => !existingIds.has(l._id));
            return [...prev, ...newItems];
          });
          pageRef.current += 1;
        }
        setHasMore(data.items.length === PAGE_LIMIT && targetPage * PAGE_LIMIT < data.total);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [conversationId],
  );

  // Present / dismiss based on isVisible
  useEffect(() => {
    if (isVisible && conversationId) {
      sheetRef.current?.present();
      fetchLogs(true);
    } else {
      sheetRef.current?.dismiss();
    }
  }, [isVisible, conversationId, fetchLogs]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) fetchLogs(false);
  }, [loading, hasMore, fetchLogs]);

  const handleCallBack = useCallback(
    (entry: CallLogEntry) => {
      if (!currentUserId) return;
      const remoteUserId =
        entry.initiatorId === currentUserId ? entry.targetUserId : entry.initiatorId;
      const remoteName =
        entry.initiatorId === currentUserId ? entry.targetName : entry.initiatorName;
      const remoteAvatar =
        entry.initiatorId === currentUserId ? entry.targetAvatar : entry.initiatorAvatar;

      if (!webrtcService.isConnected()) {
        Alert.alert('Lỗi', 'Chưa kết nối, vui lòng thử lại.');
        return;
      }

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
        const d = data as {
          sessionId?: string;
          iceServers?: { urls: string; username?: string; credential?: string }[];
        };
        cleanup();
        if (!d.sessionId) {
          Alert.alert('Lỗi', 'Không thể khởi tạo cuộc gọi');
          return;
        }
        // Dismiss sheet before navigating to CallModal
        sheetRef.current?.dismiss();
        rootNav.navigate('CallModal', {
          sessionId: d.sessionId,
          callType: entry.callType,
          isInitiator: true,
          iceServers: d.iceServers,
          remoteUser: {
            id: remoteUserId,
            displayName: remoteName || 'User',
            avatar: remoteAvatar,
          },
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
      }, 15000);

      webrtcService.on('call_initiated', onInitiated);
      webrtcService.on('call_busy', onBusy);
      webrtcService.on('call_missed', onMissed);
      webrtcService.on('error', onError);

      webrtcService.initiateCall(remoteUserId, entry.conversationId, entry.callType);
    },
    [currentUserId, rootNav],
  );

  const renderItem = useCallback(
    ({ item }: { item: CallLogEntry }) => {
      const isOutgoing = item.initiatorId === currentUserId;
      const remoteName = isOutgoing ? item.targetName || 'User' : item.initiatorName || 'User';
      const remoteAvatar = isOutgoing ? item.targetAvatar : item.initiatorAvatar;
      const statusInfo = getStatusInfo(item.status, isOutgoing, tokens.semantic);
      const duration = formatDuration(item.duration);
      const timeAgo = formatRelativeTimestamp(item.startedAt);
      const isMissedIncoming = !isOutgoing && (item.status === 'missed' || item.status === 'cancelled');

      return (
        <Pressable
          style={({ pressed }) => [styles.logItem, pressed && styles.logItemPressed]}
          onPress={() => handleCallBack(item)}
          accessibilityRole="button"
          accessibilityLabel={`${remoteName}, ${statusInfo.label}, ${timeAgo}. Nhấn để gọi lại.`}>
          <UserAvatar displayName={remoteName} avatar={remoteAvatar} size={48} />
          <View style={styles.logContent}>
            <KoolaText
              weight="500"
              numberOfLines={1}
              style={isMissedIncoming ? { color: tokens.semantic.status.danger } : undefined}>
              {remoteName}
            </KoolaText>
            <View style={styles.logMeta}>
              <MaterialIcons name={statusInfo.icon} size={16} color={statusInfo.color} />
              <KoolaText variant="caption" style={{ color: statusInfo.color, marginLeft: 4 }}>
                {statusInfo.label}
              </KoolaText>
              {!!duration && (
                <KoolaText variant="caption" tone="muted" style={{ marginLeft: 4 }}>
                  {' '}
                  · {duration}
                </KoolaText>
              )}
            </View>
          </View>
          <View style={styles.logRight}>
            <KoolaText variant="caption" tone="muted">
              {timeAgo}
            </KoolaText>
            <MaterialIcons
              name={item.callType === 'video' ? 'videocam' : 'call'}
              size={20}
              color={tokens.semantic.action.primary}
              style={styles.callTypeIcon}
            />
          </View>
        </Pressable>
      );
    },
    [currentUserId, handleCallBack, tokens.semantic, styles],
  );

  const renderEmpty = useCallback(() => {
    if (loading || refreshing) return null;
    return (
      <KoolaEmptyState
        icon="phone-missed"
        title="Chưa có cuộc gọi nào trong cuộc trò chuyện này"
        message="Lịch sử cuộc gọi sẽ xuất hiện ở đây"
      />
    );
  }, [loading, refreshing]);

  const renderFooter = useCallback(() => {
    if (!loading || refreshing) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={tokens.semantic.action.primary} />
      </View>
    );
  }, [loading, refreshing, tokens.semantic.action.primary, styles]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      enableDismissOnClose
      onDismiss={handleDismiss}>
      <View style={styles.header}>
        <KoolaText variant="heading" weight="700">
          Lịch sử cuộc gọi
        </KoolaText>
      </View>
      <BottomSheetFlatList
        data={logs}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        refreshing={refreshing}
        onRefresh={() => fetchLogs(true)}
        contentContainerStyle={logs.length === 0 ? styles.emptyList : undefined}
      />
    </BottomSheetModal>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    header: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: semantic.border.subtle,
    },
    logItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: semantic.border.subtle,
    },
    logItemPressed: {
      opacity: 0.7,
    },
    logContent: {
      flex: 1,
      marginLeft: 12,
    },
    logMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    logRight: {
      alignItems: 'flex-end',
      marginLeft: 8,
    },
    callTypeIcon: {
      marginTop: 2,
    },
    emptyList: {
      flexGrow: 1,
    },
    footerLoader: {
      paddingVertical: 16,
      alignItems: 'center',
    },
  });

export default ConversationCallHistorySheet;
