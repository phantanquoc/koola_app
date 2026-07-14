import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../../../../contexts/AuthContext';
import { usersApi } from '../../../../services/api/apiService';
import { KoolaTextInput, KoolaText } from '../../../../ui';
import { EditProfileSheet } from './EditProfileSheet';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const DisplayNameSheet: React.FC<Props> = ({ visible, onClose }) => {
  const { user, refreshUser } = useAuth();
  const [value, setValue] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(user?.displayName || '');
    }
  }, [visible, user?.displayName]);

  const trimmed = value.trim();
  const isDirty = trimmed !== (user?.displayName || '');
  const isValid = trimmed.length > 0 && trimmed.length <= 80;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await usersApi.updateMe({ displayName: trimmed });
      await refreshUser();
      onClose();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      Alert.alert('Lỗi', error.response?.data?.message || 'Không thể cập nhật');
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditProfileSheet
      visible={visible}
      onClose={onClose}
      title="Tên hiển thị"
      dirty={isDirty}
      saving={saving}
      saveDisabled={!isValid || !isDirty}
      onSave={handleSave}>
      <KoolaTextInput
        value={value}
        onChangeText={setValue}
        placeholder="Tên hiển thị của bạn"
        autoCapitalize="words"
        maxLength={80}
        autoFocus
      />
      <KoolaText
        variant="caption"
        tone="muted"
        style={{ marginTop: 6, textAlign: 'right' }}>
        {value.length}/80
      </KoolaText>
    </EditProfileSheet>
  );
};
