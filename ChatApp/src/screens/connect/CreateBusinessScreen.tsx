import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { ConnectTabStackParamList } from '../../navigation/types';
import type { RelationshipType, CreateBusinessPayload } from '../../types';
import { businessesApi } from '../../services/api/apiService';
import { BUSINESS_CATEGORIES } from './constants';

type CreateBusinessNavProp = NativeStackNavigationProp<ConnectTabStackParamList>;

// Strip 'all' from categories for the form
const FORM_CATEGORIES = BUSINESS_CATEGORIES.filter((c) => c.slug !== 'all');

const RELATIONSHIP_OPTIONS: { value: RelationshipType; label: string }[] = [
  { value: 'partner', label: 'Đối tác' },
  { value: 'supplier', label: 'Nhà cung cấp' },
];

interface FieldErrors {
  name?: string;
  relationshipType?: string;
  category?: string;
  province?: string;
}

const CreateBusinessScreen: React.FC = () => {
  const navigation = useNavigation<CreateBusinessNavProp>();

  // Required fields
  const [name, setName] = useState('');
  const [relationshipType, setRelationshipType] = useState<RelationshipType | ''>('');
  const [category, setCategory] = useState('');
  const [province, setProvince] = useState('');

  // Optional fields
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // UI state
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Picker open state
  const [relationshipOpen, setRelationshipOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const validate = (): boolean => {
    const newErrors: FieldErrors = {};

    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = 'Tên doanh nghiệp phải có ít nhất 2 ký tự';
    }
    if (!relationshipType) {
      newErrors.relationshipType = 'Vui lòng chọn loại quan hệ';
    }
    if (!category) {
      newErrors.category = 'Vui lòng chọn lĩnh vực';
    }
    if (!province.trim()) {
      newErrors.province = 'Vui lòng nhập tỉnh/thành phố';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);

    const dto: CreateBusinessPayload = {
      name: name.trim(),
      relationshipType: relationshipType as RelationshipType,
      category,
      province: province.trim(),
      ...(tagline.trim() && { tagline: tagline.trim() }),
      ...(description.trim() && { description: description.trim() }),
      ...(address.trim() && { address: address.trim() }),
      ...(website.trim() && { website: website.trim() }),
      ...(contactEmail.trim() && { contactEmail: contactEmail.trim() }),
      ...(contactPhone.trim() && { contactPhone: contactPhone.trim() }),
    };

    try {
      await businessesApi.create(dto);
      Alert.alert(
        'Đã gửi yêu cầu',
        'Đã gửi yêu cầu đăng ký doanh nghiệp. Vui lòng chờ admin duyệt.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        'Đăng ký không thành công. Vui lòng thử lại.';
      setSubmitError(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      setSubmitting(false);
    }
  }, [
    name,
    relationshipType,
    category,
    province,
    tagline,
    description,
    address,
    website,
    contactEmail,
    contactPhone,
    navigation,
  ]);

  const selectedRelationshipLabel =
    RELATIONSHIP_OPTIONS.find((o) => o.value === relationshipType)?.label || '';
  const selectedCategoryLabel =
    FORM_CATEGORIES.find((c) => c.slug === category)?.label || '';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">

      {/* Required fields section */}
      <Text style={styles.sectionHeader}>Thông tin bắt buộc</Text>

      {/* Name */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Tên doanh nghiệp *</Text>
        <TextInput
          style={[styles.input, errors.name && styles.inputError]}
          placeholder="Nhập tên doanh nghiệp"
          placeholderTextColor="#9CA3AF"
          value={name}
          onChangeText={setName}
          returnKeyType="next"
        />
        {errors.name ? (
          <Text style={styles.errorText}>{errors.name}</Text>
        ) : null}
      </View>

      {/* Relationship type picker */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Loại quan hệ *</Text>
        <TouchableOpacity
          style={[styles.pickerButton, errors.relationshipType && styles.inputError]}
          onPress={() => {
            setRelationshipOpen((prev) => !prev);
            setCategoryOpen(false);
          }}
          activeOpacity={0.7}>
          <Text
            style={[
              styles.pickerText,
              !selectedRelationshipLabel && styles.pickerPlaceholder,
            ]}>
            {selectedRelationshipLabel || 'Chọn loại quan hệ'}
          </Text>
          <MaterialIcons
            name={relationshipOpen ? 'expand-less' : 'expand-more'}
            size={20}
            color="#6B7280"
          />
        </TouchableOpacity>
        {relationshipOpen && (
          <View style={styles.optionList}>
            {RELATIONSHIP_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionItem,
                  relationshipType === opt.value && styles.optionItemSelected,
                ]}
                onPress={() => {
                  setRelationshipType(opt.value);
                  setRelationshipOpen(false);
                  if (errors.relationshipType) {
                    setErrors((e) => ({ ...e, relationshipType: undefined }));
                  }
                }}
                activeOpacity={0.7}>
                <Text
                  style={[
                    styles.optionText,
                    relationshipType === opt.value && styles.optionTextSelected,
                  ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {errors.relationshipType ? (
          <Text style={styles.errorText}>{errors.relationshipType}</Text>
        ) : null}
      </View>

      {/* Category picker */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Lĩnh vực *</Text>
        <TouchableOpacity
          style={[styles.pickerButton, errors.category && styles.inputError]}
          onPress={() => {
            setCategoryOpen((prev) => !prev);
            setRelationshipOpen(false);
          }}
          activeOpacity={0.7}>
          <Text
            style={[
              styles.pickerText,
              !selectedCategoryLabel && styles.pickerPlaceholder,
            ]}>
            {selectedCategoryLabel || 'Chọn lĩnh vực'}
          </Text>
          <MaterialIcons
            name={categoryOpen ? 'expand-less' : 'expand-more'}
            size={20}
            color="#6B7280"
          />
        </TouchableOpacity>
        {categoryOpen && (
          <View style={styles.optionList}>
            {FORM_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.slug}
                style={[
                  styles.optionItem,
                  category === cat.slug && styles.optionItemSelected,
                ]}
                onPress={() => {
                  setCategory(cat.slug);
                  setCategoryOpen(false);
                  if (errors.category) {
                    setErrors((e) => ({ ...e, category: undefined }));
                  }
                }}
                activeOpacity={0.7}>
                <Text
                  style={[
                    styles.optionText,
                    category === cat.slug && styles.optionTextSelected,
                  ]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {errors.category ? (
          <Text style={styles.errorText}>{errors.category}</Text>
        ) : null}
      </View>

      {/* Province */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Tỉnh/Thành phố *</Text>
        <TextInput
          style={[styles.input, errors.province && styles.inputError]}
          placeholder="Ví dụ: HCM City, Hà Nội"
          placeholderTextColor="#9CA3AF"
          value={province}
          onChangeText={setProvince}
          returnKeyType="next"
        />
        {errors.province ? (
          <Text style={styles.errorText}>{errors.province}</Text>
        ) : null}
      </View>

      {/* Optional fields section */}
      <Text style={[styles.sectionHeader, styles.sectionHeaderOptional]}>
        Thông tin bổ sung (tuỳ chọn)
      </Text>

      {/* Tagline */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Slogan</Text>
        <TextInput
          style={styles.input}
          placeholder="Tối đa 120 ký tự"
          placeholderTextColor="#9CA3AF"
          value={tagline}
          onChangeText={setTagline}
          maxLength={120}
          returnKeyType="next"
        />
      </View>

      {/* Description */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Giới thiệu</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Mô tả chi tiết về doanh nghiệp (tối đa 1000 ký tự)"
          placeholderTextColor="#9CA3AF"
          value={description}
          onChangeText={setDescription}
          maxLength={1000}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      {/* Address */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Địa chỉ</Text>
        <TextInput
          style={styles.input}
          placeholder="Địa chỉ cụ thể"
          placeholderTextColor="#9CA3AF"
          value={address}
          onChangeText={setAddress}
          returnKeyType="next"
        />
      </View>

      {/* Website */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Website</Text>
        <TextInput
          style={styles.input}
          placeholder="https://..."
          placeholderTextColor="#9CA3AF"
          value={website}
          onChangeText={setWebsite}
          keyboardType="url"
          autoCapitalize="none"
          returnKeyType="next"
        />
      </View>

      {/* Contact email */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Email liên hệ</Text>
        <TextInput
          style={styles.input}
          placeholder="email@company.com"
          placeholderTextColor="#9CA3AF"
          value={contactEmail}
          onChangeText={setContactEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          returnKeyType="next"
        />
      </View>

      {/* Contact phone */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Số điện thoại liên hệ</Text>
        <TextInput
          style={styles.input}
          placeholder="028-xxxx-xxxx"
          placeholderTextColor="#9CA3AF"
          value={contactPhone}
          onChangeText={setContactPhone}
          keyboardType="phone-pad"
          returnKeyType="done"
        />
      </View>

      {/* Submit error */}
      {submitError ? (
        <View style={styles.submitErrorContainer}>
          <MaterialIcons name="error-outline" size={16} color="#DC2626" />
          <Text style={styles.submitErrorText}>{submitError}</Text>
        </View>
      ) : null}

      {/* Submit button */}
      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        activeOpacity={0.8}
        disabled={submitting}>
        {submitting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.submitBtnText}>Gửi yêu cầu đăng ký</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1565C0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 4,
  },
  sectionHeaderOptional: {
    marginTop: 20,
    color: '#6B7280',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1F2937',
  },
  inputError: {
    borderColor: '#DC2626',
  },
  textArea: {
    height: 100,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 4,
  },
  pickerButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText: {
    fontSize: 14,
    color: '#1F2937',
    flex: 1,
  },
  pickerPlaceholder: {
    color: '#9CA3AF',
  },
  optionList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    marginTop: 4,
    overflow: 'hidden',
  },
  optionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  optionItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  optionText: {
    fontSize: 14,
    color: '#1F2937',
  },
  optionTextSelected: {
    color: '#1565C0',
    fontWeight: '600',
  },
  submitErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  submitErrorText: {
    fontSize: 13,
    color: '#DC2626',
    flex: 1,
  },
  submitBtn: {
    backgroundColor: '#1565C0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default CreateBusinessScreen;
