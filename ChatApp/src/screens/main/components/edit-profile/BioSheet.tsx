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

export const BioSheet: React.FC<Props> = ({ visible, onClose }) => {
  const { user, refreshUser } = useAuth();
  const [value, setValue] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(user?.bio || '');
    }
  }, [visible, user?.bio]);

  const isDirty = value !== (user?.bio || '');
  const isValid = value.length <= 160;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await usersApi.updateMe({ bio: value });
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
      title="Giới thiệu"
      dirty={isDirty}
      saving={saving}
      saveDisabled={!isValid || !isDirty}
      onSave={handleSave}>
      <KoolaTextInput
        value={value}
        onChangeText={setValue}
        placeholder="Viết giới thiệu ngắn về bạn"
        multiline
        numberOfLines={4}
        maxLength={160}
        autoFocus
        style={{ minHeight: 100, textAlignVertical: 'top' }}
      />
      <KoolaText
        variant="caption"
        tone="muted"
        style={{ marginTop: 6, textAlign: 'right' }}>
        {value.length}/160
      </KoolaText>
    </EditProfileSheet>
  );
};
