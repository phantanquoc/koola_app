import React, { useState, useEffect } from 'react';
import { Alert, View, StyleSheet } from 'react-native';
import { useAuth } from '../../../../contexts/AuthContext';
import { usersApi } from '../../../../services/api/apiService';
import { KoolaChip } from '../../../../ui';
import { EditProfileSheet } from './EditProfileSheet';
import type { UserGender } from '../../../../types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const OPTIONS: { value: UserGender; label: string }[] = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other', label: 'Khác' },
  { value: 'prefer_not', label: 'Không nêu' },
];

export const GenderSheet: React.FC<Props> = ({ visible, onClose }) => {
  const { user, refreshUser } = useAuth();
  const [selected, setSelected] = useState<UserGender | null>(
    (user?.gender as UserGender) || null,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelected((user?.gender as UserGender) || null);
    }
  }, [visible, user?.gender]);

  const isDirty = selected !== ((user?.gender as UserGender) || null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await usersApi.updateMe({ gender: selected });
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
      title="Giới tính"
      dirty={isDirty}
      saving={saving}
      saveDisabled={!isDirty}
      onSave={handleSave}>
      <View style={styles.chips}>
        {OPTIONS.map((opt) => (
          <KoolaChip
            key={opt.value}
            label={opt.label}
            selected={selected === opt.value}
            onPress={() =>
              setSelected(selected === opt.value ? null : opt.value)
            }
            accessibilityRole="button"
            accessibilityState={{ selected: selected === opt.value }}
          />
        ))}
      </View>
    </EditProfileSheet>
  );
};

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});
