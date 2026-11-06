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
  KoolaMenu,
  KoolaSurface,
  KoolaText,
  koolaConfirm,
  koolaSpacing,
  useKoolaToast,
  useTheme,
  type KoolaMenuItem,
} from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';
import { getNotchHeaderHeight } from '../../components/NotchHeader';
import { usePersonalNavHeader } from '../../navigation/PersonalHeaderContext';
import { useTabBarBottomInset } from '../../navigation/MainNavigator';
import { useAuth } from '../../contexts/AuthContext';
import { useBusinessPermissions } from '../../hooks/useBusinessPermissions';
import MemberListItem from '../../components/business/MemberListItem';
import RoleBadge from '../../components/business/RoleBadge';
import {
  businessInvitesApi,
  businessMembersApi,
  type BusinessInvite,
  type BusinessMember,
} from '../../services/api/apiService';
import { BUSINESS_ROLE_LABEL, type BusinessRole } from '../../types';
import { describeApiError } from './businessErrors';

/** Roles an admin may assign from the actions menu. */
const ASSIGNABLE_ROLES: readonly BusinessRole[] = [
  'admin',
  'editor',
  'viewer',
] as const;

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: semantic.bg.canvas },
    content: { padding: koolaSpacing.lg, gap: koolaSpacing.lg },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: koolaSpacing.sm,
    },
    card: { overflow: 'hidden' },
    inviteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: koolaSpacing.md,
      paddingVertical: koolaSpacing.md,
      paddingHorizontal: koolaSpacing.md,
    },
    inviteBody: { flex: 1, gap: 3 },
    inviteMeta: { flexDirection: 'row', alignItems: 'center', gap: koolaSpacing.sm },
    inviteActions: { flexDirection: 'row', gap: koolaSpacing.sm },
    inviteAction: { paddingHorizontal: koolaSpacing.md, minHeight: 36 },
    emptyCard: { paddingVertical: koolaSpacing.lg },
  });

/**
 * Member management for a business account (tasks 14.1-14.3, 14.6).
 *
 * Reachable only from a business session: the member list is scoped to the
 * ACTIVE account, so `activeAccount._id` is the businessId. Viewers/editors can
 * read the roster (the backend puts no role guard on the list) but every write
 * is admin+, so the invite button and the per-row actions are gated on
 * `can('member.invite')` / `can('member.changeRole')`.
 */
const ManageMembersScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarBottomInset();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const toast = useKoolaToast();

  const { activeAccount, user } = useAuth();
  const { canInviteMembers, canManageMembers } = useBusinessPermissions();
  const businessId = activeAccount?._id;
  // `user._id` is the ACTIVE identity (the business) after a switch, so the
  // human behind the session is the root actor — matched against member rows.
  const selfUserId = activeAccount?.ownerUserId ?? user?._id;

  const [members, setMembers] = useState<BusinessMember[]>([]);
  const [invites, setInvites] = useState<BusinessInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<BusinessMember | null>(null);

  usePersonalNavHeader('Thành viên', () => navigation.goBack());
  const scrollPadTop = getNotchHeaderHeight(insets.top, 'nav') + 8;

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!businessId) return;
      if (mode === 'initial') setLoading(true);
      setError(null);
      try {
        // Pending invites are admin+ on the backend; a viewer would get a 403
        // that has nothing to do with the roster, so only ask when allowed.
        const [memberRows, inviteRows] = await Promise.all([
          businessMembersApi.list(businessId),
          canInviteMembers
            ? businessInvitesApi.list(businessId).catch(() => [])
            : Promise.resolve([] as BusinessInvite[]),
        ]);
        setMembers(memberRows);
        setInvites(inviteRows);
      } catch (err) {
        setError(describeApiError(err, 'Không tải được danh sách thành viên.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [businessId, canInviteMembers],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load('refresh');
  }, [load]);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const changeRole = useCallback(
    async (member: BusinessMember, role: BusinessRole) => {
      if (!businessId) return;
      setBusyId(member._id);
      try {
        await businessMembersApi.changeRole(businessId, member.userId._id, role);
        // Optimistic patch instead of a refetch: the row is already on screen
        // and the only field that changed is the role.
        setMembers((prev) =>
          prev.map((m) => (m._id === member._id ? { ...m, role } : m)),
        );
        toast.show(
          `Đã đổi vai trò thành ${BUSINESS_ROLE_LABEL[role]}`,
          'success',
        );
      } catch (err) {
        toast.show(describeApiError(err, 'Không đổi được vai trò.'), 'danger');
      } finally {
        setBusyId(null);
      }
    },
    [businessId, toast],
  );

  const removeMember = useCallback(
    (member: BusinessMember) => {
      if (!businessId) return;
      koolaConfirm({
        title: 'Xoá thành viên',
        message: `${member.userId.displayName} sẽ mất quyền truy cập tài khoản kinh doanh này ngay lập tức.`,
        confirmLabel: 'XOÁ',
        destructive: true,
        onConfirm: async () => {
          setBusyId(member._id);
          try {
            await businessMembersApi.remove(businessId, member.userId._id);
            setMembers((prev) => prev.filter((m) => m._id !== member._id));
            toast.show('Đã xoá thành viên', 'success');
          } catch (err) {
            toast.show(
              describeApiError(err, 'Không xoá được thành viên.'),
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

  const revokeInvite = useCallback(
    (invite: BusinessInvite) => {
      if (!businessId) return;
      koolaConfirm({
        title: 'Thu hồi lời mời',
        message: `Liên kết đã gửi tới ${invite.email} sẽ không dùng được nữa.`,
        confirmLabel: 'THU HỒI',
        destructive: true,
        onConfirm: async () => {
          setBusyId(invite.id);
          try {
            await businessInvitesApi.revoke(businessId, invite.id);
            setInvites((prev) => prev.filter((i) => i.id !== invite.id));
            toast.show('Đã thu hồi lời mời', 'success');
          } catch (err) {
            toast.show(
              describeApiError(err, 'Không thu hồi được lời mời.'),
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

  const resendInvite = useCallback(
    async (invite: BusinessInvite) => {
      if (!businessId) return;
      setBusyId(invite.id);
      try {
        await businessInvitesApi.resend(businessId, invite.id);
        toast.show(`Đã gửi lại lời mời tới ${invite.email}`, 'success');
      } catch (err) {
        toast.show(describeApiError(err, 'Không gửi lại được lời mời.'), 'danger');
      } finally {
        setBusyId(null);
      }
    },
    [businessId, toast],
  );

  // ─── Actions menu (task 14.3) ─────────────────────────────────────────────

  const menuItems = useMemo<KoolaMenuItem[]>(() => {
    if (!menuFor) return [];
    const target = menuFor;
    const roleItems: KoolaMenuItem[] = ASSIGNABLE_ROLES.map((role) => ({
      key: `role:${role}`,
      label: `Đổi thành ${BUSINESS_ROLE_LABEL[role]}`,
      icon: 'swap-horiz',
      selected: target.role === role,
      disabled: target.role === role,
      onPress: () => {
        setMenuFor(null);
        void changeRole(target, role);
      },
    }));

    return [
      ...roleItems,
      {
        key: 'remove',
        label: 'Xoá khỏi doanh nghiệp',
        icon: 'person-remove',
        destructive: true,
        onPress: () => {
          setMenuFor(null);
          removeMember(target);
        },
      },
    ];
  }, [menuFor, changeRole, removeMember]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!businessId || activeAccount?.accountType !== 'business') {
    return (
      <View style={[styles.screen, { paddingTop: scrollPadTop }]}>
        <KoolaEmptyState
          icon="business"
          title="Chưa ở trong tài khoản kinh doanh"
          message="Chuyển sang một tài khoản kinh doanh để quản lý thành viên."
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: scrollPadTop }]}>
        <KoolaLoadingState message="Đang tải thành viên…" />
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        {/* ─── Members ─────────────────────────────────────────────── */}
        <View>
          <View style={styles.sectionHeader}>
            <KoolaText variant="caption" tone="muted" weight="700" accessibilityRole="header">
              {`THÀNH VIÊN (${members.length})`}
            </KoolaText>
          </View>

          <KoolaSurface variant="raised" style={styles.card}>
            {members.length === 0 ? (
              <KoolaEmptyState
                icon="group"
                title="Chưa có thành viên"
                message="Mời đồng nghiệp để cùng quản lý tài khoản này."
                style={styles.emptyCard}
              />
            ) : (
              members.map((member, index) => (
                <React.Fragment key={member._id}>
                  {index > 0 && <KoolaDivider />}
                  <MemberListItem
                    member={member}
                    isSelf={!!selfUserId && member.userId._id === selfUserId}
                    busy={busyId === member._id}
                    onActionsPress={
                      canManageMembers ? () => setMenuFor(member) : undefined
                    }
                  />
                </React.Fragment>
              ))
            )}
          </KoolaSurface>
        </View>

        {/* ─── Pending invites (task 14.6) ─────────────────────────── */}
        {canInviteMembers && (
          <View>
            <View style={styles.sectionHeader}>
              <KoolaText variant="caption" tone="muted" weight="700" accessibilityRole="header">
                {`LỜI MỜI ĐANG CHỜ (${invites.length})`}
              </KoolaText>
            </View>

            <KoolaSurface variant="raised" style={styles.card}>
              {invites.length === 0 ? (
                <KoolaEmptyState
                  icon="mail-outline"
                  title="Không có lời mời nào đang chờ"
                  style={styles.emptyCard}
                />
              ) : (
                invites.map((invite, index) => (
                  <React.Fragment key={invite.id}>
                    {index > 0 && <KoolaDivider />}
                    <View style={styles.inviteRow}>
                      <MaterialIcons
                        name="mail-outline"
                        size={22}
                        color={tokens.semantic.text.muted}
                      />
                      <View style={styles.inviteBody}>
                        <KoolaText variant="label" numberOfLines={1}>
                          {invite.email}
                        </KoolaText>
                        <View style={styles.inviteMeta}>
                          <RoleBadge role={invite.role} />
                          {!!invite.expiresAt && (
                            <KoolaText variant="caption" tone="muted">
                              {`Hết hạn ${new Date(invite.expiresAt).toLocaleDateString('vi-VN')}`}
                            </KoolaText>
                          )}
                        </View>
                      </View>
                      <View style={styles.inviteActions}>
                        <KoolaButton
                          title="Gửi lại"
                          variant="secondary"
                          size="sm"
                          style={styles.inviteAction}
                          loading={busyId === invite.id}
                          disabled={busyId === invite.id}
                          onPress={() => void resendInvite(invite)}
                        />
                        <KoolaButton
                          title="Thu hồi"
                          variant="dangerOutline"
                          size="sm"
                          style={styles.inviteAction}
                          disabled={busyId === invite.id}
                          onPress={() => revokeInvite(invite)}
                        />
                      </View>
                    </View>
                  </React.Fragment>
                ))
              )}
            </KoolaSurface>
          </View>
        )}

        {canInviteMembers && (
          <KoolaButton
            title="Mời thành viên"
            icon="person-add"
            onPress={() => (navigation as any).navigate('InviteMember')}
          />
        )}
      </ScrollView>

      <KoolaMenu
        visible={!!menuFor}
        items={menuItems}
        onDismiss={() => setMenuFor(null)}
      />
    </View>
  );
};

export default ManageMembersScreen;
