import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import apiClient from '../../services/api/apiService';
import { webrtcService } from '../../services/webrtc/WebRTCService';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../../components/UserAvatar';
import { KoolaText, KoolaEmptyState, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import type { RootStackParamList } from '../../navigation/types';
import { formatRelativeTimestamp } from '../../utils/formatViTimestamp';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CallLogEntry {
  _id: string;
  sessionId: string;
  initiatorId: string;
  targetUserId: string;
  conversationId: string;
  callType: 'audio' | 'video';
  status: 'ended' | 'missed' | 'declined' | 'busy' | 'failed' | 'cancelled';
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  duration: number;
  initiatorName?: string;
  initiatorAvatar?: string;
  targetName?: string;
  targetAvatar?: string;
}

interface CallLogsResponse {
  items: CallLogEntry[];
  total: number;
  page: number;
  limit: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

const PAGE_LIMIT = 20;

const CallsScreen: React.FC = () => {
  const { user } = useAuth();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeScreenStyles(tokens.semantic), [tokens.semantic]);
  const currentUserId = user?._id;

  const [logs, setLogs] = useState<CallLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(1);

  const fetchCallLogs = useCallback(
    async (reset = false) => {
      const targetPage = reset ? 1 : pageRef.current;
      if (reset) setRefreshing(true);
      else setLoading(true);

      try {
        const { data } = await apiClient.get<CallLogsResponse>(
          `/call-logs?page=${targetPage}&limit=${PAGE_LIMIT}`,
        );
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
        // silently fail — user can pull to refresh
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => {
      fetchCallLogs(true);
    }, []),
  );

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchCallLogs(false);
    }
  }, [loading, hasMore, fetchCallLogs]);

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

  // ─── Render ──────────────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: CallLogEntry }) => {
      const isOutgoing = item.initiatorId === currentUserId;
      const remoteName = isOutgoing
        ? item.targetName || 'User'
        : item.initiatorName || 'User';
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
              <MaterialIcons
                name={statusInfo.icon}
                size={16}
                color={statusInfo.color}
              />
              <KoolaText variant="caption" style={{ color: statusInfo.color, marginLeft: 4 }}>
                {statusInfo.label}
              </KoolaText>
              {!!duration && (
                <KoolaText variant="caption" tone="muted" style={{ marginLeft: 4 }}> · {duration}</KoolaText>
              )}
            </View>
          </View>
          <View style={styles.logRight}>
            <KoolaText variant="caption" tone="muted">{timeAgo}</KoolaText>
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
        title="Chưa có cuộc gọi nào"
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
  }, [loading, refreshing, tokens.semantic.action.primary, styles.footerLoader]);

  return (
    <View style={styles.container}>
      <FlatList
        // Fabric workaround facebook/react-native#53258 — clipped subviews race on unmount
        removeClippedSubviews={false}
        data={logs}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        refreshing={refreshing}
        onRefresh={() => fetchCallLogs(true)}
        contentContainerStyle={logs.length === 0 ? styles.emptyList : undefined}
      />
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeScreenStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: semantic.bg.canvas,
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

export default CallsScreen;
