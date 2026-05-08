import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { usersApi } from '../../services/api/apiService';
import { pickImage, uploadMedia } from '../../services/media/mediaUploadService';
import UserAvatar from '../../components/UserAvatar';

const EditProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatarUri, setAvatarUri] = useState(user?.avatar || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Keep local avatar state synced with auth context refresh
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

      // Update avatar on server (store mediaKey, UserAvatar resolves to URL)
      await usersApi.updateMe({ avatar: result.mediaKey });
      await refreshUser();
      setAvatarUri(result.mediaKey);
      Alert.alert('Thành công', 'Đã cập nhật ảnh đại diện!');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      Alert.alert('Lỗi', error.response?.data?.message || 'Không thể tải ảnh đại diện lên');
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
      Alert.alert('Lỗi', error.response?.data?.message || 'Không thể cập nhật hồ sơ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.avatarSection}>
        <TouchableOpacity onPress={handlePickAvatar} disabled={uploadingAvatar}>
          <UserAvatar
            displayName={displayName || user?.displayName || '?'}
            avatar={avatarUri || undefined}
            size={100}
          />
          {uploadingAvatar ? (
            <View style={s.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : (
            <View style={s.cameraIcon}>
              <Text style={s.cameraText}>📷</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={s.avatarHint}>Nhấn để đổi ảnh đại diện</Text>
      </View>

      <View style={s.form}>
        <Text style={s.label}>Tên hiển thị</Text>
        <TextInput
          style={s.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Tên hiển thị của bạn"
          placeholderTextColor="#999"
          autoCapitalize="words"
        />

        <Text style={s.label}>Email</Text>
        <View style={s.readOnly}>
          <Text style={s.readOnlyText}>{user?.email || ''}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[s.saveBtn, saving && s.disabled]}
        onPress={handleSave}
        disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.saveTxt}>Lưu thay đổi</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  avatarSection: { alignItems: 'center', paddingVertical: 32 },
  avatarOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 50,
    justifyContent: 'center', alignItems: 'center',
  },
  cameraIcon: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#2196F3', borderRadius: 16, width: 32, height: 32,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  cameraText: { fontSize: 16 },
  avatarHint: { fontSize: 13, color: '#999', marginTop: 8 },
  form: { paddingHorizontal: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 6, marginTop: 16 },
  input: {
    height: 48, borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 16, fontSize: 16, color: '#333',
  },
  readOnly: {
    height: 48, borderWidth: 1, borderColor: '#eee', borderRadius: 8,
    paddingHorizontal: 16, justifyContent: 'center', backgroundColor: '#f9f9f9',
  },
  readOnlyText: { fontSize: 16, color: '#999' },
  saveBtn: {
    marginTop: 32, marginHorizontal: 24, height: 48,
    backgroundColor: '#2196F3', borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default EditProfileScreen;
