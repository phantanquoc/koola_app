import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  KoolaChip,
  KoolaDialog,
  KoolaDivider,
  KoolaEmptyState,
  KoolaErrorState,
  KoolaLoadingState,
  KoolaMenu,
  KoolaSurface,
  KoolaText,
  koolaSpacing,
  useTheme,
  type KoolaMenuItem,
} from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import { getNotchHeaderHeight } from '../../components/NotchHeader';
import { usePersonalNavHeader } from '../../navigation/PersonalHeaderContext';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { useAuth } from '../../contexts/AuthContext';
import { useBusinessPermissions } from '../../hooks/useBusinessPermissions';
import AuditLogItem from '../../components/business/AuditLogItem';
import {
  businessAuditLogsApi,
  businessMembersApi,
  type BusinessAuditLogEntry,
  type BusinessMember,
} from '../../services/api/apiService';
import {
  FILTERABLE_EVENT_TYPES,
  auditEventMeta,
  describeAuditEvent,
} from './auditEvents';
import { describeApiError } from './businessErrors';

const PAGE_SIZE = 20;

/** Preset date windows, in days back from now. `null` = no lower bound. */
const DATE_RANGES: Array<{ key: string; label: string; days: number | null }> = [
  { key: 'all', label: 'Mọi lúc', days: null },
  { key: '7d', label: '7 ngày', days: 7 },
  { key: '30d', label: '30 ngày', days: 30 },
  { key: '90d', label: '90 ngày', days: 90 },
];

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: semantic.bg.canvas },
    filterBar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: koolaSpacing.sm,
      paddingHorizontal: koolaSpacing.lg,
      paddingBottom: koolaSpacing.md,
    },
    listCard: { marginHorizontal: koolaSpacing.lg, overflow: 'hidden' },
    footer: { paddingVertical: koolaSpacing.lg, alignItems: 'center' },
    detailBody: { gap: koolaSpacing.sm },
    detailRow: { gap: 2 },
    code: {
      padding: koolaSpacing.sm,
      borderRadius: 8,
      backgroundColor: semantic.surface.level2,
    },
  });

/**
 * Business audit log (task 18): who did what, filterable, infinite-scrolled.
 *
 * Paginated with the backend's 1-based `page` rather than a cursor — that is
 * what `GET /businesses/:id/audit-logs` offers, and the (businessId, createdAt)
 * index makes skip/limit cheap at the page depths a human actually scrolls.
 *
 * Admin+ only; the route is guarded server-side, and the screen explains itself
 * instead of rendering an empty list for an editor who got here.
 */
const AuditLogScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarBottomInset();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  const { activeAccount } = useAuth();
  const { canManageMembers, explain } = useBusinessPermissions();
  const businessId = activeAccount?._id;

  const [entries, setEntries] = useState<BusinessAuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters (task 18.3)
  const [eventType, setEventType] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState('all');
  const [eventMenuOpen, setEventMenuOpen] = useState(false);
  const [actorMenuOpen, setActorMenuOpen] = useState(false);
  const [members, setMembers] = useState<BusinessMember[]>([]);

  const [detail, setDetail] = useState<BusinessAuditLogEntry | null>(null);

  usePersonalNavHeader('Lịch sử hoạt động', () => navigation.goBack());
  const padTop = getNotchHeaderHeight(insets.top, 'nav') + 8;

  /** Guards against a second page request while one is in flight. */
  const fetchingRef = useRef(false);

  const startDate = useMemo(() => {
    const days = DATE_RANGES.find((r) => r.key === rangeKey)?.days ?? null;
    if (days == null) return undefined;
    return new Date(Date.now() - days * 86400000).toISOString();
  }, [rangeKey]);

  const fetchPage = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      if (!businessId || fetchingRef.current) return;
      fetchingRef.current = true;
      if (mode === 'replace') setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const res = await businessAuditLogsApi.list(businessId, {
          page: targetPage,
          limit: PAGE_SIZE,
          ...(eventType ? { eventType } : {}),
          ...(actorId ? { actorId } : {}),
          ...(startDate ? { startDate } : {}),
        });
        setTotal(res.total);
        setPage(res.page);
        setEntries((prev) =>
          mode === 'replace' ? res.logs : [...prev, ...res.logs],
        );
      } catch (err) {
        setError(describeApiError(err, 'Không tải được lịch sử hoạt động.'));
      } finally {
        fetchingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [businessId, eventType, actorId, startDate],
  );

  // Refetch from page 1 whenever a filter changes.
  useEffect(() => {
    void fetchPage(1, 'replace');
  }, [fetchPage]);

  // Member list powers the actor filter; failure just leaves that filter empty.
  useEffect(() => {
    if (!businessId || !canManageMembers) return;
    let alive = true;
    void businessMembersApi
      .list(businessId)
      .then((rows) => {
        if (alive) setMembers(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [businessId, canManageMembers]);

  const hasMore = entries.length < total;

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void fetchPage(page + 1, 'append');
  }, [loading, loadingMore, hasMore, page, fetchPage]);

  // ─── Filter menus ─────────────────────────────────────────────────────────

  const eventMenuItems = useMemo<KoolaMenuItem[]>(
    () => [
      {
        key: 'all',
        label: 'Tất cả hoạt động',
        selected: eventType === null,
        onPress: () => {
          setEventType(null);
          setEventMenuOpen(false);
        },
      },
      ...FILTERABLE_EVENT_TYPES.map((type) => ({
        key: type,
        label: auditEventMeta(type).label,
        icon: auditEventMeta(type).icon,
        selected: eventType === type,
        onPress: () => {
          setEventType(type);
          setEventMenuOpen(false);
        },
      })),
    ],
    [eventType],
  );

  const actorMenuItems = useMemo<KoolaMenuItem[]>(
    () => [
      {
        key: 'all',
        label: 'Mọi thành viên',
        selected: actorId === null,
        onPress: () => {
          setActorId(null);
          setActorMenuOpen(false);
        },
      },
      ...members.map((m) => ({
        key: m.userId._id,
        label: m.userId.displayName,
        selected: actorId === m.userId._id,
        onPress: () => {
          setActorId(m.userId._id);
          setActorMenuOpen(false);
        },
      })),
    ],
    [members, actorId],
  );

  const activeEventLabel = eventType
    ? auditEventMeta(eventType).label
    : 'Hoạt động';
  const activeActorLabel =
    members.find((m) => m.userId._id === actorId)?.userId.displayName ??
    'Thành viên';

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!canManageMembers) {
    return (
      <View style={[styles.screen, { paddingTop: padTop }]}>
        <KoolaEmptyState
          icon="lock-outline"
          title="Không có quyền xem"
          message={
            explain('member.remove') ??
            'Chỉ quản trị viên và chủ sở hữu xem được lịch sử hoạt động.'
          }
        />
      </View>
    );
  }

  const filterBar = (
    <View style={[styles.filterBar, { paddingTop: padTop }]}>
      <KoolaChip
        label={activeEventLabel}
        selected={!!eventType}
        onPress={() => setEventMenuOpen(true)}
      />
      <KoolaChip
        label={activeActorLabel}
        selected={!!actorId}
        onPress={() => setActorMenuOpen(true)}
      />
      {DATE_RANGES.filter((r) => r.key !== 'all').map((range) => (
        <KoolaChip
          key={range.key}
          label={range.label}
          selected={rangeKey === range.key}
          onPress={() =>
            setRangeKey((prev) => (prev === range.key ? 'all' : range.key))
          }
        />
      ))}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={filterBar}
        renderItem={({ item, index }) => (
          <KoolaSurface
            variant="raised"
            style={[
              styles.listCard,
              // One continuous card: only the first row gets a top edge and
              // only the last a bottom one, with dividers between.
              index > 0 && { marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
            ]}>
            {index > 0 && <KoolaDivider />}
            <AuditLogItem entry={item} onPress={() => setDetail(item)} />
          </KoolaSurface>
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingBottom: tabBarInset + koolaSpacing.lg }}
        ListEmptyComponent={
          loading ? (
            <KoolaLoadingState message="Đang tải lịch sử…" />
          ) : error ? (
            <KoolaErrorState
              message={error}
              actionLabel="Thử lại"
              onRetry={() => void fetchPage(1, 'replace')}
            />
          ) : (
            <KoolaEmptyState
              icon="history"
              title="Chưa có hoạt động nào"
              message={
                eventType || actorId || rangeKey !== 'all'
                  ? 'Không có hoạt động nào khớp bộ lọc.'
                  : 'Mọi thay đổi trong doanh nghiệp sẽ được ghi lại ở đây.'
              }
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={tokens.semantic.action.primary} />
            </View>
          ) : null
        }
      />

      <KoolaMenu
        visible={eventMenuOpen}
        items={eventMenuItems}
        onDismiss={() => setEventMenuOpen(false)}
      />
      <KoolaMenu
        visible={actorMenuOpen}
        items={actorMenuItems}
        onDismiss={() => setActorMenuOpen(false)}
      />

      {/* Task 18.5: full payload on tap. */}
      <KoolaDialog
        visible={!!detail}
        title={detail ? auditEventMeta(detail.eventType).label : ''}
        onDismiss={() => setDetail(null)}
        actions={[{ label: 'Đóng', onPress: () => setDetail(null) }]}>
        {detail && (
          <View style={styles.detailBody}>
            <View style={styles.detailRow}>
              <KoolaText variant="caption" tone="muted">
                Người thực hiện
              </KoolaText>
              <KoolaText variant="label">{detail.actor.displayName}</KoolaText>
            </View>

            {!!detail.createdAt && (
              <View style={styles.detailRow}>
                <KoolaText variant="caption" tone="muted">
                  Thời điểm
                </KoolaText>
                <KoolaText variant="label">
                  {new Date(detail.createdAt).toLocaleString('vi-VN')}
                </KoolaText>
              </View>
            )}

            {(() => {
              const summary = describeAuditEvent(detail);
              return summary ? (
                <View style={styles.detailRow}>
                  <KoolaText variant="caption" tone="muted">
                    Chi tiết
                  </KoolaText>
                  <KoolaText variant="label">{summary}</KoolaText>
                </View>
              ) : null;
            })()}

            {!!detail.deviceId && (
              <View style={styles.detailRow}>
                <KoolaText variant="caption" tone="muted">
                  Thiết bị
                </KoolaText>
                <KoolaText variant="label">{detail.deviceId}</KoolaText>
              </View>
            )}

            {!!detail.resourceId && (
              <View style={styles.detailRow}>
                <KoolaText variant="caption" tone="muted">
                  Đối tượng
                </KoolaText>
                <KoolaText variant="label">{detail.resourceId}</KoolaText>
              </View>
            )}

            {!!detail.changes && (
              <View style={styles.detailRow}>
                <KoolaText variant="caption" tone="muted">
                  Thay đổi
                </KoolaText>
                <View style={styles.code}>
                  <KoolaText variant="caption">
                    {JSON.stringify(detail.changes, null, 2)}
                  </KoolaText>
                </View>
              </View>
            )}
          </View>
        )}
      </KoolaDialog>
    </View>
  );
};

export default AuditLogScreen;
