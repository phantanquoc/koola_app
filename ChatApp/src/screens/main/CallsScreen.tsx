import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
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
import type { RootStackParamList } from '../../navigation/types';

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
  // Populated by backend or resolved client-side
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

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function getStatusInfo(
  status: CallLogEntry['status'],
  isOutgoing: boolean,
): { icon: string; color: string; label: string } {
  switch (status) {
    case 'ended':
      return {
        icon: isOutgoing ? 'call-made' : 'call-received',
        color: '#4CAF50',
        label: 'Đã kết thúc',
      };
    case 'missed':
      return {
        icon: 'call-missed',
        color: '#F44336',
        label: isOutgoing ? 'Không trả lời' : 'Cuộc gọi nhỡ',
      };
    case 'declined':
      return {
        icon: 'call-missed',
        color: '#FF9800',
        label: isOutgoing ? 'Bị từ chối' : 'Đã từ chối',
      };
    case 'cancelled':
      return {
        icon: 'call-missed-outgoing',
        color: '#9E9E9E',
        label: isOutgoing ? 'Đã hủy' : 'Đã hủy',
      };
    case 'busy':
      return { icon: 'phone-missed', color: '#FF9800', label: 'Đang bận' };
    case 'failed':
      return { icon: 'error-outline', color: '#F44336', label: 'Thất bại' };
    default:
      return { icon: 'call', color: '#9E9E9E', label: status };
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

const PAGE_LIMIT = 20;

const CallsScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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

      // Listen for call_initiated to navigate
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
      const statusInfo = getStatusInfo(item.status, isOutgoing);
      const duration = formatDuration(item.duration);
      const timeAgo = formatRelativeTime(item.startedAt);
      const isMissedIncoming = !isOutgoing && (item.status === 'missed' || item.status === 'cancelled');

      return (
        <TouchableOpacity
          style={styles.logItem}
          onPress={() => handleCallBack(item)}
          activeOpacity={0.7}>
          <UserAvatar displayName={remoteName} avatar={remoteAvatar} size={48} />
          <View style={styles.logContent}>
            <Text
              style={[styles.logName, isMissedIncoming && styles.missedName]}
              numberOfLines={1}>
              {remoteName}
            </Text>
            <View style={styles.logMeta}>
              <MaterialIcons
                name={statusInfo.icon}
                size={16}
                color={statusInfo.color}
              />
              <Text style={[styles.logStatus, { color: statusInfo.color }]}>
                {statusInfo.label}
              </Text>
              {!!duration && (
                <Text style={styles.logDuration}> · {duration}</Text>
              )}
            </View>
          </View>
          <View style={styles.logRight}>
            <Text style={styles.logTime}>{timeAgo}</Text>
            <MaterialIcons
              name={item.callType === 'video' ? 'videocam' : 'call'}
              size={20}
              color="#1565C0"
              style={styles.callTypeIcon}
            />
          </View>
        </TouchableOpacity>
      );
    },
    [currentUserId, handleCallBack],
  );

  const renderEmpty = useCallback(() => {
    if (loading || refreshing) return null;
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="phone-missed" size={64} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>Chưa có cuộc gọi nào</Text>
        <Text style={styles.emptySubtitle}>
          Lịch sử cuộc gọi sẽ xuất hiện ở đây
        </Text>
      </View>
    );
  }, [loading, refreshing]);

  const renderFooter = useCallback(() => {
    if (!loading || refreshing) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#1565C0" />
      </View>
    );
  }, [loading, refreshing]);

  return (
    <View style={styles.container}>
      <FlatList
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  logContent: {
    flex: 1,
    marginLeft: 12,
  },
  logName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 2,
  },
  missedName: {
    color: '#F44336',
  },
  logMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  logStatus: {
    fontSize: 13,
  },
  logDuration: {
    fontSize: 13,
    color: '#6B7280',
  },
  logRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  logTime: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  callTypeIcon: {
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 24,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});

export default CallsScreen;
