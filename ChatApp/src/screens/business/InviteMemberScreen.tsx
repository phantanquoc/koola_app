import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  KoolaButton,
  KoolaSurface,
  KoolaText,
  KoolaTextInput,
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
import RolePicker from '../../components/business/RolePicker';
import {
  businessInvitesApi,
  businessMembersApi,
  type InvitableRole,
} from '../../services/api/apiService';
import { BUSINESS_ROLE_LABEL } from '../../types';
import { describeApiError } from './businessErrors';

/** Offered in privilege order; `owner` is not invitable (backend DTO rejects it). */
const INVITABLE_ROLES: readonly InvitableRole[] = [
  'admin',
  'editor',
  'viewer',
] as const;

/**
 * Pragmatic email shape check — one `@`, a dot in the domain, no spaces.
 *
 * Deliberately not an RFC-complete pattern: this only catches typos early so
 * the user is not round-tripped for an obvious mistake. `class-validator`'s
 * `@IsEmail()` on the backend remains the authority.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: semantic.bg.canvas },
    content: { padding: koolaSpacing.lg, gap: koolaSpacing.lg },
    card: { padding: koolaSpacing.lg, gap: koolaSpacing.md },
    hint: { marginTop: -koolaSpacing.xs },
    actions: { gap: koolaSpacing.sm },
  });

/**
 * Invite a member by email (tasks 14.4, 14.5).
 *
 * Validation is layered: shape + "already a member" are caught here so the
 * common mistakes never leave the device, while duplicate pending invites and
 * authorization stay server-side (only the backend can know those). The member
 * list is fetched once on mount purely to power the local duplicate check.
 */
const InviteMemberScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarBottomInset();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const toast = useKoolaToast();

  const { activeAccount } = useAuth();
  const { canInviteMembers, explain } = useBusinessPermissions();
  const businessId = activeAccount?._id;

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole | null>('editor');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Lowercased emails of existing members, for the local duplicate check. */
  const [memberEmails, setMemberEmails] = useState<Set<string>>(new Set());

  usePersonalNavHeader('Mời thành viên', () => navigation.goBack());
  const scrollPadTop = getNotchHeaderHeight(insets.top, 'nav') + 8;

  useEffect(() => {
    if (!businessId) return;
    let alive = true;
    void businessMembersApi
      .list(businessId)
      .then((rows) => {
        if (!alive) return;
        setMemberEmails(
          new Set(
            rows
              .map((m) => m.userId.email?.trim().toLowerCase())
              .filter((e): e is string => !!e),
          ),
        );
      })
      // Non-fatal: without the list we simply let the backend's 409 answer.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [businessId]);

  const trimmed = email.trim().toLowerCase();

  const validationError = useMemo(() => {
    if (!trimmed) return 'Nhập email người bạn muốn mời.';
    if (!EMAIL_RE.test(trimmed)) return 'Email không hợp lệ.';
    if (memberEmails.has(trimmed)) return 'Người này đã là thành viên.';
    return null;
  }, [trimmed, memberEmails]);

  const canSubmit = !validationError && !!role && !submitting && canInviteMembers;

  const submit = useCallback(async () => {
    setTouched(true);
    if (!businessId || !role || validationError) return;

    setSubmitting(true);
    try {
      await businessInvitesApi.create(businessId, { email: trimmed, role });
      toast.show(
        `Đã gửi lời mời tới ${trimmed} (${BUSINESS_ROLE_LABEL[role]})`,
        'success',
      );
      navigation.goBack();
    } catch (err) {
      toast.show(describeApiError(err, 'Không gửi được lời mời.'), 'danger');
    } finally {
      setSubmitting(false);
    }
  }, [businessId, role, validationError, trimmed, toast, navigation]);

  // Permission gate with an explanation rather than a blank screen: an editor
  // who reached this route deserves to know why it is closed.
  if (!canInviteMembers) {
    return (
      <View style={[styles.screen, { paddingTop: scrollPadTop }]}>
        <View style={styles.content}>
          <KoolaSurface variant="raised" style={styles.card}>
            <KoolaText variant="label" weight="700">
              Không có quyền mời thành viên
            </KoolaText>
            <KoolaText variant="caption" tone="muted">
              {explain('member.invite') ??
                'Chỉ quản trị viên và chủ sở hữu mới mời được thành viên.'}
            </KoolaText>
          </KoolaSurface>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: scrollPadTop, paddingBottom: tabBarInset + koolaSpacing.lg },
        ]}>
        <KoolaSurface variant="raised" style={styles.card}>
          <KoolaTextInput
            label="Email"
            placeholder="ten@congty.com"
            value={email}
            onChangeText={setEmail}
            onBlur={() => setTouched(true)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            error={touched ? (validationError ?? undefined) : undefined}
            accessibilityLabel="Email người được mời"
          />
          <KoolaText variant="caption" tone="muted" style={styles.hint}>
            Người được mời phải đăng nhập Koola bằng chính email này để chấp nhận.
          </KoolaText>
        </KoolaSurface>

        <KoolaSurface variant="raised" style={styles.card}>
          <RolePicker
            label="Vai trò"
            roles={INVITABLE_ROLES}
            value={role}
            onChange={setRole}
            disabled={submitting}
          />
        </KoolaSurface>

        <View style={styles.actions}>
          <KoolaButton
            title="Gửi lời mời"
            icon="send"
            loading={submitting}
            disabled={!canSubmit}
            onPress={() => void submit()}
          />
          <KoolaButton
            title="Huỷ"
            variant="secondary"
            disabled={submitting}
            onPress={() => navigation.goBack()}
          />
        </View>
      </ScrollView>
    </View>
  );
};

export default InviteMemberScreen;
