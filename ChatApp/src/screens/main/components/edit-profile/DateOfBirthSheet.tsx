import React, { useState, useEffect } from 'react';
import { Alert, Platform, View, StyleSheet } from 'react-native';
import { useAuth } from '../../../../contexts/AuthContext';
import { usersApi } from '../../../../services/api/apiService';
import { KoolaText } from '../../../../ui';
import { EditProfileSheet } from './EditProfileSheet';

let DateTimePicker: any;
try {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {
  DateTimePicker = null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const MIN_DATE = new Date('1900-01-01');

export const DateOfBirthSheet: React.FC<Props> = ({ visible, onClose }) => {
  const { user, refreshUser } = useAuth();
  const [date, setDate] = useState<Date>(
    user?.dateOfBirth ? new Date(user.dateOfBirth) : new Date(2000, 0, 1),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setDate(
        user?.dateOfBirth ? new Date(user.dateOfBirth) : new Date(2000, 0, 1),
      );
    }
  }, [visible, user?.dateOfBirth]);

  const today = new Date();
  const originalIso = user?.dateOfBirth
    ? new Date(user.dateOfBirth).toISOString().split('T')[0]
    : null;
  const currentIso = date.toISOString().split('T')[0];
  const isDirty = currentIso !== originalIso;

  const formatDisplay = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await usersApi.updateMe({ dateOfBirth: currentIso });
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
      title="Ngày sinh"
      dirty={isDirty}
      saving={saving}
      saveDisabled={!isDirty}
      onSave={handleSave}>
      <View style={styles.content}>
        <KoolaText variant="body" tone="muted" style={styles.hint}>
          Ngày sinh: {formatDisplay(date)}
        </KoolaText>
        {DateTimePicker ? (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={today}
            minimumDate={MIN_DATE}
            onChange={(_: any, selectedDate?: Date) => {
              if (selectedDate) setDate(selectedDate);
            }}
            locale="vi"
          />
        ) : (
          <KoolaText variant="caption" tone="danger">
            DateTimePicker chưa được cài đặt
          </KoolaText>
        )}
      </View>
    </EditProfileSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  hint: {
    marginBottom: 4,
  },
});
