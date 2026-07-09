import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../../contexts/AuthContext';
import { accountsApi } from '../../services/api/apiService';
import {
  getAccountBadges,
  clearAccountBadge,
} from '../../services/push/accountBadgeStorage';
import UserAvatar from '../../components/UserAvatar';
import {
  KoolaButton,
  KoolaDivider,
  KoolaSurface,
  KoolaText,
  koolaRadii,
  koolaSpacing,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';
import type { Account, CreateBusinessAccountPayload } from '../../types';
import { BUSINESS_CATEGORIES } from '../connect/constants';

// ─── Account List Screen ──────────────────────────────────────────────────────

const VERIFICATION_LABEL: Record<string, string> = {
  pending: 'Chờ duyệt',
  verified: 'Đã xác minh',
  rejected: 'Bị từ chối',
};

const getVerificationColor = (status: string, p: Palette): string => {
  switch (status) {
    case 'pending': return p.warning;
    case 'verified': return p.success;
    case 'rejected': return p.danger;
    default: return p.muted;
  }
};

const RELATIONSHIP_OPTIONS: { value: 'partner' | 'supplier'; label: string }[] = [
  { value: 'partner', label: 'Đối tác' },
  { value: 'supplier', label: 'Nhà cung cấp' },
];

const FORM_CATEGORIES = BUSINESS_CATEGORIES.filter((c) => c.slug !== 'all');

// ─── Create Business Form (embedded modal) ────────────────────────────────────

interface CreateFormProps {
  onCreated: (account: Account) => void;
  onCancel: () => void;
}

const CreateBusinessForm: React.FC<CreateFormProps> = ({ onCreated, onCancel }) => {
  const { palette } = useTheme();
  const formStyles = useMemo(() => makeFormStyles(palette), [palette]);
  const [displayName, setDisplayName] = useState('');
  const [relationshipType, setRelationshipType] = useState<'partner' | 'supplier' | ''>('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [province, setProvince] = useState('');
  const [licenseImageKey, setLicenseImageKey] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [relationshipOpen, setRelationshipOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!displayName.trim() || displayName.trim().length < 2) {
      e.displayName = 'Tên tài khoản phải có ít nhất 2 ký tự';
    }
    if (!relationshipType) e.relationshipType = 'Vui lòng chọn loại quan hệ';
    if (!businessCategory) e.businessCategory = 'Vui lòng chọn lĩnh vực';
    if (!province.trim()) e.province = 'Vui lòng nhập tỉnh/thành phố';
    if (!licenseImageKey) e.licenseImageKey = 'Vui lòng tải lên giấy phép kinh doanh';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleUploadLicense = async () => {
    // Placeholder: in production this opens an image picker. Here we simulate
    // by accepting a typed key. Real image picking uses react-native-image-picker
    // + mediaApi.requestUploadUrl. We set a simulated key so the field validates.
    Alert.alert(
      'Tải ảnh giấy phép',
      'Nhập đường dẫn hoặc tên file ảnh (demo):',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xác nhận (demo key)',
          onPress: () => {
            setLicenseImageKey(`license/${Date.now()}.jpg`);
            setErrors((e) => ({ ...e, licenseImageKey: '' }));
          },
        },
      ],
    );
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: CreateBusinessAccountPayload = {
        displayName: displayName.trim(),
        businessCategory,
        province: province.trim(),
        relationshipType: relationshipType as 'partner' | 'supplier',
        licenseImageKey,
        ...(tagline.trim() && { tagline: tagline.trim() }),
        ...(description.trim() && { description: description.trim() }),
        ...(address.trim() && { address: address.trim() }),
        ...(website.trim() && { website: website.trim() }),
        ...(contactEmail.trim() && { contactEmail: contactEmail.trim() }),
        ...(contactPhone.trim() && { contactPhone: contactPhone.trim() }),
      };
      const { account } = await accountsApi.createBusiness(payload);
      onCreated(account);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        'Đăng ký không thành công. Vui lòng thử lại.';
      setSubmitError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedRelLabel = RELATIONSHIP_OPTIONS.find((o) => o.value === relationshipType)?.label;
  const selectedCatLabel = FORM_CATEGORIES.find((c) => c.slug === businessCategory)?.label;

  return (
    <ScrollView
      style={formStyles.formContainer}
      contentContainerStyle={formStyles.formContent}
      keyboardShouldPersistTaps="handled">

      <KoolaText variant="heading" style={formStyles.formTitle}>Thêm tài khoản doanh nghiệp</KoolaText>

      <KoolaText variant="caption" weight="700" tone="primary" style={formStyles.sectionHeader}>
        Thông tin bắt buộc
      </KoolaText>

      <View style={formStyles.fieldGroup}>
        <KoolaText variant="label" weight="600">{`Tên tài khoản *`}</KoolaText>
        <TextInput
          style={[formStyles.input, errors.displayName && formStyles.inputError]}
          placeholder="Tên doanh nghiệp"
          placeholderTextColor={palette.faint}
          value={displayName}
          onChangeText={setDisplayName}
        />
        {!!errors.displayName && <KoolaText variant="caption" tone="danger">{errors.displayName}</KoolaText>}
      </View>

      <View style={formStyles.fieldGroup}>
        <KoolaText variant="label" weight="600">{`Loại quan hệ *`}</KoolaText>
        <TouchableOpacity
          style={[formStyles.pickerButton, errors.relationshipType && formStyles.inputError]}
          onPress={() => { setRelationshipOpen((v) => !v); setCategoryOpen(false); }}>
          <KoolaText variant="body" tone={selectedRelLabel ? 'ink' : 'faint'}>
            {selectedRelLabel || 'Chọn loại quan hệ'}
          </KoolaText>
          <MaterialIcons name={relationshipOpen ? 'expand-less' : 'expand-more'} size={20} color={palette.muted} />
        </TouchableOpacity>
        {relationshipOpen && (
          <View style={formStyles.optionList}>
            {RELATIONSHIP_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[formStyles.optionItem, relationshipType === opt.value && formStyles.optionItemSelected]}
                onPress={() => { setRelationshipType(opt.value); setRelationshipOpen(false); }}>
                <KoolaText variant="body" tone={relationshipType === opt.value ? 'primary' : 'ink'} weight={relationshipType === opt.value ? '600' : '400'}>
                  {opt.label}
                </KoolaText>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {!!errors.relationshipType && <KoolaText variant="caption" tone="danger">{errors.relationshipType}</KoolaText>}
      </View>

      <View style={formStyles.fieldGroup}>
        <KoolaText variant="label" weight="600">{`Lĩnh vực *`}</KoolaText>
        <TouchableOpacity
          style={[formStyles.pickerButton, errors.businessCategory && formStyles.inputError]}
          onPress={() => { setCategoryOpen((v) => !v); setRelationshipOpen(false); }}>
          <KoolaText variant="body" tone={selectedCatLabel ? 'ink' : 'faint'}>
            {selectedCatLabel || 'Chọn lĩnh vực'}
          </KoolaText>
          <MaterialIcons name={categoryOpen ? 'expand-less' : 'expand-more'} size={20} color={palette.muted} />
        </TouchableOpacity>
        {categoryOpen && (
          <View style={formStyles.optionList}>
            {FORM_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.slug}
                style={[formStyles.optionItem, businessCategory === cat.slug && formStyles.optionItemSelected]}
                onPress={() => { setBusinessCategory(cat.slug); setCategoryOpen(false); }}>
                <KoolaText variant="body" tone={businessCategory === cat.slug ? 'primary' : 'ink'} weight={businessCategory === cat.slug ? '600' : '400'}>
                  {cat.label}
                </KoolaText>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {!!errors.businessCategory && <KoolaText variant="caption" tone="danger">{errors.businessCategory}</KoolaText>}
      </View>

      <View style={formStyles.fieldGroup}>
        <KoolaText variant="label" weight="600">{`Tỉnh/Thành phố *`}</KoolaText>
        <TextInput
          style={[formStyles.input, errors.province && formStyles.inputError]}
          placeholder="Ví dụ: HCM City, Hà Nội"
          placeholderTextColor={palette.faint}
          value={province}
          onChangeText={setProvince}
        />
        {!!errors.province && <KoolaText variant="caption" tone="danger">{errors.province}</KoolaText>}
      </View>

      <View style={formStyles.fieldGroup}>
        <KoolaText variant="label" weight="600">{`Giấy phép kinh doanh *`}</KoolaText>
        <TouchableOpacity
          style={[formStyles.uploadButton, errors.licenseImageKey && formStyles.inputError]}
          onPress={handleUploadLicense}>
          <MaterialIcons name={licenseImageKey ? 'check-circle' : 'upload-file'} size={20} color={licenseImageKey ? palette.success : palette.primary} />
          <KoolaText variant="body" weight="500" tone={licenseImageKey ? 'success' : 'primary'}>
            {licenseImageKey ? 'Đã tải lên' : 'Tải lên ảnh giấy phép'}
          </KoolaText>
        </TouchableOpacity>
        {!!errors.licenseImageKey && <KoolaText variant="caption" tone="danger">{errors.licenseImageKey}</KoolaText>}
      </View>

      <KoolaText variant="caption" weight="700" tone="muted" style={formStyles.sectionHeaderOptional}>
        Thông tin bổ sung (tuỳ chọn)
      </KoolaText>

      {[
        { label: 'Slogan', value: tagline, set: setTagline, placeholder: 'Tối đa 200 ký tự', maxLength: 200 },
        { label: 'Địa chỉ', value: address, set: setAddress, placeholder: 'Địa chỉ cụ thể' },
        { label: 'Website', value: website, set: setWebsite, placeholder: 'https://...' },
        { label: 'Email liên hệ', value: contactEmail, set: setContactEmail, placeholder: 'email@company.com' },
        { label: 'Số điện thoại liên hệ', value: contactPhone, set: setContactPhone, placeholder: '028-xxxx-xxxx' },
      ].map(({ label, value, set, placeholder, maxLength }) => (
        <View key={label} style={formStyles.fieldGroup}>
          <KoolaText variant="label" weight="600">{label}</KoolaText>
          <TextInput
            style={formStyles.input}
            placeholder={placeholder}
            placeholderTextColor={palette.faint}
            value={value}
            onChangeText={set}
            maxLength={maxLength}
          />
        </View>
      ))}

      <View style={formStyles.fieldGroup}>
        <KoolaText variant="label" weight="600">Giới thiệu</KoolaText>
        <TextInput
          style={[formStyles.input, { height: 100 }]}
          placeholder="Mô tả chi tiết (tối đa 2000 ký tự)"
          placeholderTextColor={palette.faint}
          value={description}
          onChangeText={setDescription}
          maxLength={2000}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      {!!submitError && (
        <View style={formStyles.submitErrorContainer}>
          <MaterialIcons name="error-outline" size={16} color={palette.danger} />
          <KoolaText variant="caption" tone="danger" style={{ flex: 1 }}>{submitError}</KoolaText>
        </View>
      )}

      <View style={formStyles.formActions}>
        <KoolaButton title="Huỷ" variant="secondary" onPress={onCancel} style={formStyles.cancelBtn} disabled={submitting} />
        <KoolaButton title="Gửi yêu cầu" onPress={handleSubmit} style={formStyles.submitBtn} loading={submitting} disabled={submitting} />
      </View>
    </ScrollView>
  );
};

// ─── Main Account List Screen ─────────────────────────────────────────────────

const AccountListScreen: React.FC = () => {
  const { accounts, activeAccount, switchAccount } = useAuth();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [localAccounts, setLocalAccounts] = useState<Account[]>(accounts);
  // Set of accountIds that have pending notification badges.
  const [badgedAccounts, setBadgedAccounts] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLocalAccounts(accounts);
  }, [accounts]);

  // Load badge state on mount and clear badge for the currently active account.
  useEffect(() => {
    let alive = true;
    void getAccountBadges().then((badges) => {
      if (!alive) return;
      // If the active account somehow has a stale badge, clear it.
      if (activeAccount?._id) {
        badges.delete(activeAccount._id);
        void clearAccountBadge(activeAccount._id);
      }
      setBadgedAccounts(new Set(badges));
    });
    return () => { alive = false; };
  }, [activeAccount?._id]);

  const handleSelectAccount = useCallback(
    async (account: Account) => {
      if (activeAccount?._id === account._id) return;
      try {
        await switchAccount(account._id);
        // Clear the badge for this account once the switch succeeds.
        await clearAccountBadge(account._id);
        setBadgedAccounts((prev) => {
          const next = new Set(prev);
          next.delete(account._id);
          return next;
        });
      } catch (err: any) {
        const msg = err?.message || 'Không thể chuyển tài khoản';
        Alert.alert('Lỗi', msg);
      }
    },
    [activeAccount, switchAccount],
  );

  const handleCreated = useCallback(
    (account: Account) => {
      setLocalAccounts((prev) => [...prev, account]);
      setShowCreateForm(false);
      Alert.alert(
        'Đã tạo tài khoản',
        `Tài khoản "${account.displayName}" đang chờ xác minh.`,
        [{ text: 'OK' }],
      );
    },
    [],
  );

  if (showCreateForm) {
    return (
      <CreateBusinessForm
        onCreated={handleCreated}
        onCancel={() => setShowCreateForm(false)}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.listContent}>
      <KoolaText variant="heading" style={styles.pageTitle}>Danh sách tài khoản</KoolaText>

      <KoolaSurface variant="raised" style={styles.listCard}>
        {localAccounts.map((account, index) => {
          const isActive = activeAccount?._id === account._id;
          const statusLabel = account.verificationStatus
            ? VERIFICATION_LABEL[account.verificationStatus] ?? account.verificationStatus
            : undefined;
          const statusColor = account.verificationStatus
            ? getVerificationColor(account.verificationStatus, palette)
            : undefined;
          return (
            <React.Fragment key={account._id}>
              {index > 0 && <KoolaDivider />}
              <Pressable
                style={styles.accountRow}
                onPress={() => handleSelectAccount(account)}
                accessibilityRole="button">
                <View>
                  <UserAvatar
                    displayName={account.displayName}
                    avatar={account.avatar}
                    size={44}
                  />
                  {badgedAccounts.has(account._id) && !isActive && (
                    <View style={styles.notifBadge} accessibilityLabel="Thông báo mới" />
                  )}
                </View>
                <View style={styles.accountInfo}>
                  <KoolaText variant="label" numberOfLines={1}>{account.displayName}</KoolaText>
                  <View style={styles.accountMeta}>
                    <KoolaText variant="caption" tone="muted">
                      {account.accountType === 'personal' ? 'Cá nhân' : 'Doanh nghiệp'}
                    </KoolaText>
                    {statusLabel && (
                      <KoolaText
                        variant="caption"
                        style={{ color: statusColor, marginLeft: 8 }}>
                        {statusLabel}
                      </KoolaText>
                    )}
                  </View>
                </View>
                {isActive && (
                  <MaterialIcons name="check-circle" size={20} color={palette.primary} />
                )}
              </Pressable>
            </React.Fragment>
          );
        })}
      </KoolaSurface>

      <KoolaButton
        title="Thêm tài khoản doanh nghiệp"
        icon="add-business"
        onPress={() => setShowCreateForm(true)}
        style={styles.addButton}
      />
    </ScrollView>
  );
};

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.canvas,
    },
    listContent: {
      padding: koolaSpacing.lg,
      paddingBottom: koolaSpacing['40'],
    },
    pageTitle: {
      marginBottom: koolaSpacing.lg,
    },
    listCard: {
      marginBottom: 20,
    },
    accountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      gap: 12,
    },
    notifBadge: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: p.danger,
      borderWidth: 1.5,
      borderColor: p.surface,
    },
    accountInfo: {
      flex: 1,
    },
    accountMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    addButton: {
      marginTop: koolaSpacing.sm,
    },
  });

const makeFormStyles = (p: Palette) =>
  StyleSheet.create({
    formContainer: {
      flex: 1,
      backgroundColor: p.canvas,
    },
    formContent: {
      padding: koolaSpacing.lg,
      paddingBottom: koolaSpacing['40'],
    },
    formTitle: {
      marginBottom: koolaSpacing.lg,
    },
    sectionHeader: {
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: koolaSpacing.md,
      marginTop: koolaSpacing.xs,
    },
    sectionHeaderOptional: {
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: koolaSpacing.md,
      marginTop: 20,
    },
    fieldGroup: {
      marginBottom: koolaSpacing.lg,
    },
    input: {
      backgroundColor: p.surface,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14,
      color: p.ink,
      marginTop: 6,
    },
    inputError: {
      borderColor: p.danger,
    },
    pickerButton: {
      backgroundColor: p.surface,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      paddingHorizontal: 14,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
    },
    optionList: {
      backgroundColor: p.surface,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      marginTop: 4,
      overflow: 'hidden',
    },
    optionItem: {
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    optionItemSelected: {
      backgroundColor: p.primarySoft,
    },
    uploadButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: p.surface,
      borderRadius: koolaRadii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.line,
      paddingHorizontal: 14,
      paddingVertical: 11,
      marginTop: 6,
    },
    submitErrorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: p.dangerSoft,
      borderRadius: koolaRadii.md,
      padding: 12,
      marginBottom: koolaSpacing.lg,
    },
    formActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: koolaSpacing.sm,
    },
    cancelBtn: {
      flex: 1,
    },
    submitBtn: {
      flex: 1,
    },
  });

export default AccountListScreen;
