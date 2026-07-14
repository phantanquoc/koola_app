import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, View, StyleSheet } from 'react-native';
import { useAuth } from '../../../../contexts/AuthContext';
import { usersApi } from '../../../../services/api/apiService';
import { KoolaTextInput, KoolaText } from '../../../../ui';
import { EditProfileSheet } from './EditProfileSheet';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

export const UsernameSheet: React.FC<Props> = ({ visible, onClose }) => {
  const { user, refreshUser } = useAuth();
  const [value, setValue] = useState(user?.username || '');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<{
    available: boolean;
    reason?: string;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setValue(user?.username || '');
      setAvailability(null);
    }
  }, [visible, user?.username]);

  const checkAvailability = useCallback(
    async (username: string) => {
      if (!USERNAME_REGEX.test(username)) {
        setAvailability(null);
        setChecking(false);
        return;
      }
      setChecking(true);
      try {
        const result = await usersApi.checkUsername(username);
        setAvailability(result);
      } catch {
        setAvailability(null);
      } finally {
        setChecking(false);
      }
    },
    [],
  );

  const handleChange = (text: string) => {
    const lower = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setValue(lower);
    setAvailability(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (lower && USERNAME_REGEX.test(lower)) {
      debounceRef.current = setTimeout(() => {
        checkAvailability(lower);
      }, 400);
    }
  };

  const formatValid = value.length === 0 || USERNAME_REGEX.test(value);
  const isDirty = value !== (user?.username || '');
  const canSave =
    isDirty &&
    formatValid &&
    value.length >= 3 &&
    availability?.available === true &&
    !checking;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await usersApi.updateMe({ username: value });
      await refreshUser();
      onClose();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      Alert.alert('Lỗi', error.response?.data?.message || 'Không thể cập nhật');
    } finally {
      setSaving(false);
    }
  };

  const renderFeedback = () => {
    if (!value || value.length < 3) return null;
    if (!formatValid) {
      return (
        <KoolaText variant="caption" tone="danger" style={styles.feedback}>
          Chỉ chữ thường, số và dấu gạch dưới (3-30 ký tự)
        </KoolaText>
      );
    }
    if (checking) {
      return (
        <KoolaText variant="caption" tone="muted" style={styles.feedback}>
          Đang kiểm tra...
        </KoolaText>
      );
    }
    if (availability?.available) {
      return (
        <KoolaText variant="caption" tone="success" style={styles.feedback}>
          Tên người dùng khả dụng
        </KoolaText>
      );
    }
    if (availability && !availability.available) {
      const msg =
        availability.reason === 'taken'
          ? 'Tên người dùng đã được sử dụng'
          : availability.reason === 'reserved'
            ? 'Tên người dùng không được phép'
            : 'Định dạng không hợp lệ';
      return (
        <KoolaText variant="caption" tone="danger" style={styles.feedback}>
          {msg}
        </KoolaText>
      );
    }
    return null;
  };

  return (
    <EditProfileSheet
      visible={visible}
      onClose={onClose}
      title="Tên người dùng"
      dirty={isDirty}
      saving={saving}
      saveDisabled={!canSave}
      onSave={handleSave}>
      <KoolaTextInput
        value={value}
        onChangeText={handleChange}
        placeholder="ten_nguoi_dung"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={30}
        autoFocus
      />
      <View style={styles.row}>
        <KoolaText variant="caption" tone="muted">
          {value.length}/30
        </KoolaText>
        {renderFeedback()}
      </View>
    </EditProfileSheet>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  feedback: {
    flex: 1,
    textAlign: 'right',
  },
});
