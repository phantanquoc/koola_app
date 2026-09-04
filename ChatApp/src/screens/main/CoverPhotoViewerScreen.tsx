import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Alert,
  StatusBar,
  Platform,
  ActivityIndicator,
  ToastAndroid,
  PermissionsAndroid,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { ZoomableImage } from '../chat/ImageViewerScreen';
import { useAuth } from '../../contexts/AuthContext';
import { usersApi } from '../../services/api/apiService';
import { pickImage, uploadMedia } from '../../services/media/mediaUploadService';
import { getOrDownload } from '../../services/media/mediaCacheService';
import { koolaColors } from '../../ui';
import type { RootStackParamList } from '../../navigation/types';

// Lazy import — avoid crash if native module not yet linked
const getBlobUtil = () => require('react-native-blob-util').default;

type CoverPhotoViewerRouteProp = RouteProp<RootStackParamList, 'CoverPhotoViewer'>;

const CoverPhotoViewerScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<CoverPhotoViewerRouteProp>();
  const { mediaKey } = route.params;
  const { refreshUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getOrDownload(mediaKey)
      .then((uri) => setCoverUri(uri))
      .catch(() => setCoverUri(null));
  }, [mediaKey]);

  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle('light-content');
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor('#000');
      }
      return () => {
        StatusBar.setBarStyle('dark-content');
        if (Platform.OS === 'android') {
          StatusBar.setBackgroundColor('#ffffff');
        }
      };
    }, []),
  );

  const handleClose = () => {
    navigation.goBack();
  };

  const requestStoragePermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    if (Platform.Version >= 29) return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      {
        title: 'Quyền lưu ảnh',
        message: 'Cho phép ứng dụng lưu ảnh vào thư viện',
        buttonPositive: 'Cho phép',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const handleDownload = async () => {
    if (!coverUri) return;
    try {
      const hasPermission = await requestStoragePermission();
      if (!hasPermission) {
        Alert.alert('Lỗi', 'Không có quyền lưu ảnh');
        return;
      }

      setBusy(true);
      const ext = coverUri.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
      const fileName = `koola_${Date.now()}.${ext}`;

      const BlobUtil = getBlobUtil();
      const { dirs } = BlobUtil.fs;
      const downloadDir = Platform.OS === 'android' ? dirs.PictureDir : dirs.DocumentDir;
      const filePath = `${downloadDir}/${fileName}`;

      const res = await BlobUtil.config({ path: filePath, fileCache: true }).fetch('GET', coverUri);
      const savedPath = res.path();

      if (Platform.OS === 'android') {
        await BlobUtil.MediaCollection.copyToMediaStore(
          { name: fileName, parentFolder: 'Koola', mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}` },
          'Image',
          savedPath,
        );
        BlobUtil.fs.unlink(savedPath).catch(() => {});
        ToastAndroid.show('Đã lưu ảnh vào thư viện', ToastAndroid.SHORT);
      } else {
        Alert.alert('Thành công', 'Đã lưu ảnh');
      }
    } catch (err) {
      console.warn('[CoverPhotoViewer] Download error:', err);
      Alert.alert('Lỗi', 'Không thể tải ảnh');
    } finally {
      setBusy(false);
    }
  };

  const handleReplace = async () => {
    const picked = await pickImage();
    if (!picked) return;
    if (picked === 'TOO_LARGE') {
      Alert.alert('Lỗi', 'Ảnh vượt quá dung lượng tối đa');
      return;
    }
    setBusy(true);
    try {
      const result = await uploadMedia(picked.uri, picked.filename, picked.mimeType, picked.size);
      await usersApi.updateMe({ coverPhoto: result.mediaKey });
      await refreshUser();
      navigation.goBack();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      Alert.alert('Lỗi', error.response?.data?.message || 'Không thể tải ảnh bìa');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = () => {
    Alert.alert('Xóa ảnh bìa?', 'Bạn có thể tải lại ảnh khác bất cứ lúc nào.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await usersApi.updateMe({ coverPhoto: '' });
            await refreshUser();
            navigation.goBack();
          } catch (err) {
            const error = err as { response?: { data?: { message?: string } } };
            Alert.alert('Lỗi', error.response?.data?.message || 'Không thể xóa ảnh bìa');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Pressable
          onPress={handleClose}
          style={s.btn}
          accessibilityRole="button"
          accessibilityLabel="Đóng">
          <Text style={s.btnTxt}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={handleDownload}
          style={s.btn}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Tải ảnh xuống">
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={s.btnTxt}>⬇</Text>
          )}
        </Pressable>
      </View>

      {/* Image or loader */}
      {coverUri ? (
        <ZoomableImage uri={coverUri} />
      ) : (
        <View style={s.loading}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Bottom action bar */}
      <View style={[s.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          onPress={handleReplace}
          disabled={busy}
          style={[s.actionBtn, busy && s.actionBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Đổi ảnh bìa">
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons name="swap-horiz" size={20} color="#fff" />
              <Text style={s.actionBtnLabel}>Đổi ảnh bìa</Text>
            </>
          )}
        </Pressable>
        <View style={{ width: 12 }} />
        <Pressable
          onPress={handleRemove}
          disabled={busy}
          style={[s.actionBtn, s.actionBtnDanger, busy && s.actionBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Xóa ảnh bìa">
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons name="delete-outline" size={20} color="#fff" />
              <Text style={s.actionBtnLabel}>Xóa ảnh bìa</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: (StatusBar.currentHeight || 44) + 8,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnTxt: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 20,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  actionBtnDanger: {
    backgroundColor: koolaColors.danger,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnLabel: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 6,
    fontSize: 15,
  },
});

export default CoverPhotoViewerScreen;
