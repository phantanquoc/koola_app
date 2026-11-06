import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaButton,
  KoolaDivider,
  KoolaEmptyState,
  KoolaErrorState,
  KoolaLoadingState,
  KoolaSurface,
  KoolaText,
  koolaConfirm,
  koolaRadii,
  koolaSpacing,
  useKoolaToast,
  useTheme,
} from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import { getNotchHeaderHeight } from '../../components/NotchHeader';
import { usePersonalNavHeader } from '../../navigation/PersonalHeaderContext';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { useAuth } from '../../contexts/AuthContext';
import { useBusinessPermissions } from '../../hooks/useBusinessPermissions';
import { formatRelativeTimestamp } from '../../utils/formatViTimestamp';
import { getDeviceId } from '../../services/DeviceIdService';
import {
  businessSessionsApi,
  type BusinessSession,
} from '../../services/api/apiService';
import { describeApiError } from './businessErrors';

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: semantic.bg.canvas },
    content: { padding: koolaSpacing.lg, gap: koolaSpacing.lg },
    intro: { paddingHorizontal: koolaSpacing.xs },
    card: { overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: koolaSpacing.md,
      padding: koolaSpacing.md,
    },
    iconShell: {
      width: 40,
      height: 40,
      borderRadius: koolaRadii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: semantic.surface.level2,
    },
    body: { flex: 1, gap: 3 },
    thisDevice: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: koolaRadii.pill,
      backgroundColor: semantic.action.primarySoft,
    },
    action: { paddingHorizontal: koolaSpacing.md, minHeight: 36 },
    emptyCard: { paddingVertical: koolaSpacing.lg },
  });

/**
 * Active device sessions for the business (tasks 17.3, 17.4).
 *
 * One row per member, because the backend enforces one device per
 * (business, member) — a second login evicts the first. The row for the device
 * you are holding is labelled and has no force-logout button: the backend
 * rejects self-logout (you would be signing yourself out through the admin
 * surface), and the real action for that is Đăng xuất.
 */
const ActiveSessionsScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarBottomInset();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const toast = useKoolaToast();

  const { activeAccount } = useAuth();
  const { canManageMembers, explain } = useBusinessPermissions();
  const businessId = activeAccount?._id;

  const [sessions, setSessions] = useState<BusinessSession[]>([]);
  const [thisDeviceId, setThisDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  usePersonalNavHeader('Thiết bị đang đăng nhập', () => navigation.goBack());
  const scrollPadTop = getNotchHeaderHeight(insets.top, 'nav') + 8;

  useEffect(() => {
    let alive = true;
    void getDeviceId()
      .then((id) => {
        if (alive) setThisDeviceId(id);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!businessId) return;
      if (mode === 'initial') setLoading(true);
      setError(null);
      try {
        setSessions(await businessSessionsApi.list(businessId));
      } catch (err) {
        setError(describeApiError(err, 'Không tải được danh sách thiết bị.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [businessId],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const forceLogout = useCallback(
    (session: BusinessSession) => {
      if (!businessId) return;
      koolaConfirm({
        title: 'Buộc đăng xuất',
        message: `${session.user.displayName} sẽ bị đăng xuất khỏi ${
          session.deviceModel || 'thiết bị này'
        } và phải đăng nhập lại.`,
        confirmLabel: 'ĐĂNG XUẤT',
        destructive: true,
        onConfirm: async () => {
          setBusyId(session.id);
          try {
            await businessSessionsApi.forceLogout(businessId, session.id);
            setSessions((prev) => prev.filter((s) => s.id !== session.id));
            toast.show('Đã buộc đăng xuất thiết bị', 'success');
          } catch (err) {
            toast.show(
              describeApiError(err, 'Không buộc đăng xuất được.'),
              'danger',
            );
          } finally {
            setBusyId(null);
          }
        },
      });
    },
    [businessId, toast],
  );

  if (!canManageMembers) {
    return (
      <View style={[styles.screen, { paddingTop: scrollPadTop }]}>
        <KoolaEmptyState
          icon="lock-outline"
          title="Không có quyền xem"
          message={
            explain('member.remove') ??
            'Chỉ quản trị viên và chủ sở hữu xem được thiết bị đang đăng nhập.'
          }
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: scrollPadTop }]}>
        <KoolaLoadingState message="Đang tải thiết bị…" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.screen, { paddingTop: scrollPadTop }]}>
        <KoolaErrorState
          message={error}
          actionLabel="Thử lại"
          onRetry={() => void load('initial')}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: scrollPadTop, paddingBottom: tabBarInset + koolaSpacing.lg },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load('refresh');
            }}
          />
        }>
        <KoolaText variant="caption" tone="muted" style={styles.intro}>
          Mỗi thành viên chỉ đăng nhập được trên một thiết bị. Đăng nhập ở thiết bị
          mới sẽ tự đăng xuất thiết bị cũ.
        </KoolaText>

        <KoolaSurface variant="raised" style={styles.card}>
          {sessions.length === 0 ? (
            <KoolaEmptyState
              icon="devices"
              title="Chưa có thiết bị nào"
              message="Khi thành viên đăng nhập, thiết bị của họ sẽ hiện ở đây."
              style={styles.emptyCard}
            />
          ) : (
            sessions.map((session, index) => {
              const isThisDevice =
                !!thisDeviceId && session.deviceId === thisDeviceId;
              return (
                <React.Fragment key={session.id}>
                  {index > 0 && <KoolaDivider />}
                  <View style={styles.row}>
                    <View style={styles.iconShell}>
                      <MaterialIcons
                        name={isThisDevice ? 'smartphone' : 'devices-other'}
                        size={20}
                        color={
                          isThisDevice
                            ? tokens.semantic.action.primary
                            : tokens.semantic.text.muted
                        }
                      />
                    </View>

                    <View style={styles.body}>
                      <KoolaText variant="label" numberOfLines={1}>
                        {session.user.displayName}
                      </KoolaText>
                      <KoolaText variant="caption" tone="muted" numberOfLines={1}>
                        {[session.deviceModel, session.osVersion]
                          .filter(Boolean)
                          .join(' · ') || 'Thiết bị không rõ'}
                      </KoolaText>
                      <KoolaText variant="caption" tone="muted">
                        {session.lastActiveAt
                          ? `Hoạt động ${formatRelativeTimestamp(
                              session.lastActiveAt,
                            ).toLowerCase()}`
                          : 'Chưa có hoạt động'}
                      </KoolaText>
                      {isThisDevice && (
                        <View style={styles.thisDevice}>
                          <KoolaText variant="caption" weight="700" tone="primary">
                            Thiết bị này
                          </KoolaText>
                        </View>
                      )}
                    </View>

                    {!isThisDevice && (
                      <KoolaButton
                        title="Đăng xuất"
                        variant="dangerOutline"
                        size="sm"
                        style={styles.action}
                        loading={busyId === session.id}
                        disabled={busyId === session.id}
                        onPress={() => forceLogout(session)}
                      />
                    )}
                  </View>
                </React.Fragment>
              );
            })
          )}
        </KoolaSurface>
      </ScrollView>
    </View>
  );
};

export default ActiveSessionsScreen;
