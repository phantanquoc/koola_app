import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { usersApi } from '../../services/api/apiService';
import { pickImage, uploadMedia } from '../../services/media/mediaUploadService';
import UserAvatar from '../../components/UserAvatar';
import {
  KoolaButton,
  KoolaSurface,
  KoolaText,
  KoolaTextInput,
  koolaColors,
  koolaRadii,
} from '../../ui';

const EditProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatarUri, setAvatarUri] = useState(user?.avatar || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    setAvatarUri(user?.avatar || '');
  }, [user?.avatar]);

  const handlePickAvatar = async () => {
    try {
      const picked = await pickImage();
      if (!picked) return;
      if (picked === 'TOO_LARGE') {
        Alert.alert('Lỗi', 'Ảnh vượt quá dung lượng tối đa');
        return;
      }

      setUploadingAvatar(true);
      const result = await uploadMedia(
        picked.uri,
        picked.filename,
        picked.mimeType,
        picked.size,
      );

      await usersApi.updateMe({ avatar: result.mediaKey });
      await refreshUser();
      setAvatarUri(result.mediaKey);
      Alert.alert('Thành công', 'Đã cập nhật ảnh đại diện!');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      Alert.alert(
        'Lỗi',
        error.response?.data?.message || 'Không thể tải ảnh đại diện lên',
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Lỗi', 'Tên hiển thị không được để trống');
      return;
    }

    setSaving(true);
    try {
      await usersApi.updateMe({ displayName: displayName.trim() });
      await refreshUser();
      Alert.alert('Thành công', 'Đã cập nhật hồ sơ!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      Alert.alert(
        'Lỗi',
        error.response?.data?.message || 'Không thể cập nhật hồ sơ',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KoolaSurface variant="raised" style={styles.card}>
        <Pressable
          onPress={handlePickAvatar}
          disabled={uploadingAvatar}
          style={styles.avatarButton}
          accessibilityRole="button">
          <UserAvatar
            displayName={displayName || user?.displayName || '?'}
            avatar={avatarUri || undefined}
            size={104}
          />
          {uploadingAvatar ? (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : (
            <View style={styles.cameraIcon}>
              <MaterialIcons name="photo-camera" size={18} color="#FFFFFF" />
            </View>
          )}
        </Pressable>
        <KoolaText variant="caption" tone="muted" weight="700">
          Nhấn để đổi ảnh đại diện
        </KoolaText>
      </KoolaSurface>

      <KoolaSurface variant="flat" style={styles.form}>
        <KoolaTextInput
          label="Tên hiển thị"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Tên hiển thị của bạn"
          autoCapitalize="words"
          icon="person-outline"
        />

        <KoolaText variant="caption" tone="muted" weight="700">
          Email
        </KoolaText>
        <KoolaSurface variant="soft" style={styles.readOnly}>
          <KoolaText tone="muted" numberOfLines={1}>
            {user?.email || ''}
          </KoolaText>
        </KoolaSurface>
      </KoolaSurface>

      <KoolaButton
        title="Lưu thay đổi"
        icon="save"
        loading={saving}
        disabled={saving}
        onPress={handleSave}
        style={styles.saveBtn}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
    padding: 20,
  },
  card: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  avatarButton: {
    position: 'relative',
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(16,24,40,0.45)',
    borderRadius: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: koolaColors.primary,
    borderRadius: 17,
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: koolaColors.surface,
  },
  form: {
    marginTop: 18,
    gap: 10,
  },
  readOnly: {
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: koolaRadii.md,
  },
  saveBtn: {
    marginTop: 22,
  },
});

export default EditProfileScreen;
