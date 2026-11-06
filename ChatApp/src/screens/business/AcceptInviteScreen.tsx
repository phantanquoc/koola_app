import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaButton,
  KoolaErrorState,
  KoolaLoadingState,
  KoolaSurface,
  KoolaText,
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
import RoleBadge from '../../components/business/RoleBadge';
import { ROLE_DESCRIPTION } from '../../components/business/RolePicker';
import {
  businessInvitesApi,
  type InvitePreview,
} from '../../services/api/apiService';
import type { PersonalTabStackParamList } from '../../navigation/types';
import { BUSINESS_ROLE_LABEL } from '../../types';
import { describeApiError } from './businessErrors';

type AcceptInviteRoute = RouteProp<PersonalTabStackParamList, 'AcceptInvite'>;

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: semantic.bg.canvas },
    content: { padding: koolaSpacing.lg, gap: koolaSpacing.lg },
    card: { padding: koolaSpacing.lg, gap: koolaSpacing.md, alignItems: 'center' },
    logoShell: {
      width: 64,
      height: 64,
      borderRadius: koolaRadii.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: semantic.action.primarySoft,
    },
    centered: { textAlign: 'center' },
    capabilityCard: { padding: koolaSpacing.lg, gap: koolaSpacing.sm },
    capabilityRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: koolaSpacing.sm,
    },
    actions: { gap: koolaSpacing.sm },
    emailNote: { marginTop: koolaSpacing.xs },
  });

/**
 * Accept (or decline) a business invite opened from an email deep link
 * (tasks 15.2, 15.4-15.7).
 *
 * The token arrives as a route param from `koola://invite?token=…`. Both the
 * verify and accept endpoints sit behind the global JwtAuthGuard, so this
 * screen only ever renders for a signed-in user — the unauthenticated case is
 * handled before navigation by `pendingInviteStore` (task 15.3), which parks
 * the token until login completes and then routes here.
 */
const AcceptInviteScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<AcceptInviteRoute>();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarBottomInset();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const toast = useKoolaToast();

  const { user, switchAccount, refreshAccounts } = useAuth();
  const token = route.params?.token ?? '';

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  usePersonalNavHeader('Lời mời', () => navigation.goBack());
  const scrollPadTop = getNotchHeaderHeight(insets.top, 'nav') + 8;

  const verify = useCallback(async () => {
    if (!token) {
      setError('Liên kết mời không hợp lệ.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setInvite(await businessInvitesApi.verify(token));
    } catch (err) {
      setError(describeApiError(err, 'Không đọc được lời mời.'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void verify();
  }, [verify]);

  /**
   * Task 15.7: an invite whose email does not match the signed-in account can
   * never be accepted (the backend 403s), so say so before the user taps.
   */
  const emailMismatch =
    !!invite?.email &&
    !!user?.email &&
    invite.email.toLowerCase() !== user.email.toLowerCase();

  const accept = useCallback(async () => {
    if (!invite) return;
    setAccepting(true);
    try {
      const result = await businessInvitesApi.accept(token);

      // Task 15.6: the new business only appears in the switcher after the
      // account list is refetched — do it before switching so switchAccount
      // can resolve the target from `accounts`.
      await refreshAccounts();

      const targetId = result.businessId || invite.businessId;

      if (result.alreadyMember) {
        // Task 15.7: already accepted (e.g. the link was opened twice) is not
        // an error — land the user inside the business.
        toast.show(`Bạn đã là thành viên ${invite.businessName}`, 'info');
      } else {
        toast.show(
          `Chào mừng tới ${invite.businessName} — bạn là ${BUSINESS_ROLE_LABEL[
            invite.role
          ].toLowerCase()}`,
          'success',
        );
      }

      if (targetId) {
        await switchAccount(targetId);
      }
      navigation.goBack();
    } catch (err) {
      toast.show(describeApiError(err, 'Không chấp nhận được lời mời.'), 'danger');
    } finally {
      setAccepting(false);
    }
  }, [invite, token, refreshAccounts, switchAccount, toast, navigation]);

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: scrollPadTop }]}>
        <KoolaLoadingState message="Đang kiểm tra lời mời…" />
      </View>
    );
  }

  if (error || !invite) {
    return (
      <View style={[styles.screen, { paddingTop: scrollPadTop }]}>
        <KoolaErrorState
          icon="link-off"
          title="Lời mời không dùng được"
          message={error ?? 'Lời mời đã hết hạn hoặc bị thu hồi.'}
          actionLabel="Thử lại"
          onRetry={() => void verify()}
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
        ]}>
        <KoolaSurface variant="raised" style={styles.card}>
          <View style={styles.logoShell}>
            <MaterialIcons
              name="storefront"
              size={32}
              color={tokens.semantic.action.primary}
            />
          </View>

          <KoolaText variant="heading" style={styles.centered}>
            {invite.businessName}
          </KoolaText>

          <KoolaText variant="body" tone="muted" style={styles.centered}>
            {invite.inviterName
              ? `${invite.inviterName} mời bạn tham gia với vai trò:`
              : 'Bạn được mời tham gia với vai trò:'}
          </KoolaText>

          <RoleBadge role={invite.role} />

          {!!invite.expiresAt && (
            <KoolaText variant="caption" tone="muted" style={styles.centered}>
              {`Lời mời hết hạn ${new Date(invite.expiresAt).toLocaleDateString('vi-VN')}`}
            </KoolaText>
          )}

          {emailMismatch && (
            <KoolaText
              variant="caption"
              tone="danger"
              style={[styles.centered, styles.emailNote]}>
              {`Lời mời dành cho ${invite.email}, nhưng bạn đang đăng nhập bằng ${user?.email}. Hãy đăng nhập đúng email để chấp nhận.`}
            </KoolaText>
          )}
        </KoolaSurface>

        {/* Task 15.5: what the role actually lets them do, before accepting. */}
        <KoolaSurface variant="raised" style={styles.capabilityCard}>
          <KoolaText variant="label" weight="700">
            Quyền của bạn
          </KoolaText>
          <View style={styles.capabilityRow}>
            <MaterialIcons
              name="check-circle-outline"
              size={18}
              color={tokens.semantic.status.success}
            />
            <KoolaText variant="caption" tone="muted" style={{ flex: 1 }}>
              {ROLE_DESCRIPTION[invite.role]}
            </KoolaText>
          </View>
        </KoolaSurface>

        <View style={styles.actions}>
          <KoolaButton
            title="Chấp nhận lời mời"
            icon="check"
            loading={accepting}
            disabled={accepting || emailMismatch}
            onPress={() => void accept()}
          />
          <KoolaButton
            title="Từ chối"
            variant="secondary"
            disabled={accepting}
            onPress={() => navigation.goBack()}
          />
        </View>
      </ScrollView>
    </View>
  );
};

export default AcceptInviteScreen;
