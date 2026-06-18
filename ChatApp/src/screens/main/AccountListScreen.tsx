import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Text,
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
  koolaColors,
  koolaRadii,
} from '../../ui';
import type { Account, CreateBusinessAccountPayload } from '../../types';
import { BUSINESS_CATEGORIES } from '../connect/constants';

// ─── Account List Screen ──────────────────────────────────────────────────────

const VERIFICATION_LABEL: Record<string, string> = {
  pending: 'Chờ duyệt',
  verified: 'Đã xác minh',
  rejected: 'Bị từ chối',
};

const VERIFICATION_COLOR: Record<string, string> = {
  pending: koolaColors.warning,
  verified: koolaColors.success,
  rejected: koolaColors.danger,
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
      style={styles.formContainer}
      contentContainerStyle={styles.formContent}
      keyboardShouldPersistTaps="handled">

      <KoolaText variant="heading" style={styles.formTitle}>Thêm tài khoản doanh nghiệp</KoolaText>

      <Text style={styles.sectionHeader}>Thông tin bắt buộc</Text>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Tên tài khoản *</Text>
        <TextInput
          style={[styles.input, errors.displayName && styles.inputError]}
          placeholder="Tên doanh nghiệp"
          placeholderTextColor="#9CA3AF"
          value={displayName}
          onChangeText={setDisplayName}
        />
        {!!errors.displayName && <Text style={styles.errorText}>{errors.displayName}</Text>}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Loại quan hệ *</Text>
        <TouchableOpacity
          style={[styles.pickerButton, errors.relationshipType && styles.inputError]}
          onPress={() => { setRelationshipOpen((v) => !v); setCategoryOpen(false); }}>
          <Text style={[styles.pickerText, !selectedRelLabel && styles.pickerPlaceholder]}>
            {selectedRelLabel || 'Chọn loại quan hệ'}
          </Text>
          <MaterialIcons name={relationshipOpen ? 'expand-less' : 'expand-more'} size={20} color="#6B7280" />
        </TouchableOpacity>
        {relationshipOpen && (
          <View style={styles.optionList}>
            {RELATIONSHIP_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionItem, relationshipType === opt.value && styles.optionItemSelected]}
                onPress={() => { setRelationshipType(opt.value); setRelationshipOpen(false); }}>
                <Text style={[styles.optionText, relationshipType === opt.value && styles.optionTextSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {!!errors.relationshipType && <Text style={styles.errorText}>{errors.relationshipType}</Text>}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Lĩnh vực *</Text>
        <TouchableOpacity
          style={[styles.pickerButton, errors.businessCategory && styles.inputError]}
          onPress={() => { setCategoryOpen((v) => !v); setRelationshipOpen(false); }}>
          <Text style={[styles.pickerText, !selectedCatLabel && styles.pickerPlaceholder]}>
            {selectedCatLabel || 'Chọn lĩnh vực'}
          </Text>
          <MaterialIcons name={categoryOpen ? 'expand-less' : 'expand-more'} size={20} color="#6B7280" />
        </TouchableOpacity>
        {categoryOpen && (
          <View style={styles.optionList}>
            {FORM_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.slug}
                style={[styles.optionItem, businessCategory === cat.slug && styles.optionItemSelected]}
                onPress={() => { setBusinessCategory(cat.slug); setCategoryOpen(false); }}>
                <Text style={[styles.optionText, businessCategory === cat.slug && styles.optionTextSelected]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {!!errors.businessCategory && <Text style={styles.errorText}>{errors.businessCategory}</Text>}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Tỉnh/Thành phố *</Text>
        <TextInput
          style={[styles.input, errors.province && styles.inputError]}
          placeholder="Ví dụ: HCM City, Hà Nội"
          placeholderTextColor="#9CA3AF"
          value={province}
          onChangeText={setProvince}
        />
        {!!errors.province && <Text style={styles.errorText}>{errors.province}</Text>}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Giấy phép kinh doanh *</Text>
        <TouchableOpacity
          style={[styles.uploadButton, errors.licenseImageKey && styles.inputError]}
          onPress={handleUploadLicense}>
          <MaterialIcons name={licenseImageKey ? 'check-circle' : 'upload-file'} size={20} color={licenseImageKey ? koolaColors.success ?? '#10B981' : koolaColors.primary} />
          <Text style={[styles.uploadText, { color: licenseImageKey ? koolaColors.success ?? '#10B981' : koolaColors.primary }]}>
            {licenseImageKey ? 'Đã tải lên' : 'Tải lên ảnh giấy phép'}
          </Text>
        </TouchableOpacity>
        {!!errors.licenseImageKey && <Text style={styles.errorText}>{errors.licenseImageKey}</Text>}
      </View>

      <Text style={[styles.sectionHeader, { color: koolaColors.muted, marginTop: 20 }]}>
        Thông tin bổ sung (tuỳ chọn)
      </Text>

      {[
        { label: 'Slogan', value: tagline, set: setTagline, placeholder: 'Tối đa 200 ký tự', maxLength: 200 },
        { label: 'Địa chỉ', value: address, set: setAddress, placeholder: 'Địa chỉ cụ thể' },
        { label: 'Website', value: website, set: setWebsite, placeholder: 'https://...' },
        { label: 'Email liên hệ', value: contactEmail, set: setContactEmail, placeholder: 'email@company.com' },
        { label: 'Số điện thoại liên hệ', value: contactPhone, set: setContactPhone, placeholder: '028-xxxx-xxxx' },
      ].map(({ label, value, set, placeholder, maxLength }) => (
        <View key={label} style={styles.fieldGroup}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
            value={value}
            onChangeText={set}
            maxLength={maxLength}
          />
        </View>
      ))}

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Giới thiệu</Text>
        <TextInput
          style={[styles.input, { height: 100 }]}
          placeholder="Mô tả chi tiết (tối đa 2000 ký tự)"
          placeholderTextColor="#9CA3AF"
          value={description}
          onChangeText={setDescription}
          maxLength={2000}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      {!!submitError && (
        <View style={styles.submitErrorContainer}>
          <MaterialIcons name="error-outline" size={16} color={koolaColors.danger} />
          <Text style={[styles.errorText, { flex: 1 }]}>{submitError}</Text>
        </View>
      )}

      <View style={styles.formActions}>
        <KoolaButton title="Huỷ" variant="secondary" onPress={onCancel} style={styles.cancelBtn} disabled={submitting} />
        <KoolaButton title="Gửi yêu cầu" onPress={handleSubmit} style={styles.submitBtn} loading={submitting} disabled={submitting} />
      </View>
    </ScrollView>
  );
};

// ─── Main Account List Screen ─────────────────────────────────────────────────

const AccountListScreen: React.FC = () => {
  const { accounts, activeAccount, switchAccount } = useAuth();
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
            ? VERIFICATION_COLOR[account.verificationStatus] ?? koolaColors.muted
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
                  <MaterialIcons name="check-circle" size={20} color={koolaColors.primary} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  pageTitle: {
    marginBottom: 16,
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
    backgroundColor: koolaColors.danger,
    borderWidth: 1.5,
    borderColor: koolaColors.surface,
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
    marginTop: 8,
  },
  // Form styles
  formContainer: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },
  formContent: {
    padding: 16,
    paddingBottom: 40,
  },
  formTitle: {
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: koolaColors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 4,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: koolaColors.ink,
    marginBottom: 6,
  },
  input: {
    backgroundColor: koolaColors.surface,
    borderRadius: koolaRadii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: koolaColors.ink,
  },
  inputError: {
    borderColor: koolaColors.danger,
  },
  errorText: {
    fontSize: 12,
    color: koolaColors.danger,
    marginTop: 4,
  },
  pickerButton: {
    backgroundColor: koolaColors.surface,
    borderRadius: koolaRadii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText: {
    fontSize: 14,
    color: koolaColors.ink,
    flex: 1,
  },
  pickerPlaceholder: {
    color: koolaColors.faint,
  },
  optionList: {
    backgroundColor: koolaColors.surface,
    borderRadius: koolaRadii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    marginTop: 4,
    overflow: 'hidden',
  },
  optionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionItemSelected: {
    backgroundColor: koolaColors.primarySoft,
  },
  optionText: {
    fontSize: 14,
    color: koolaColors.ink,
  },
  optionTextSelected: {
    color: koolaColors.primary,
    fontWeight: '600',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: koolaColors.surface,
    borderRadius: koolaRadii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  uploadText: {
    fontSize: 14,
    fontWeight: '500',
  },
  submitErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: koolaColors.dangerSoft,
    borderRadius: koolaRadii.md,
    padding: 12,
    marginBottom: 16,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
  },
  submitBtn: {
    flex: 1,
  },
});

export default AccountListScreen;
