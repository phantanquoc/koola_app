import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { mediaApi } from '../services/api/apiService';
import Toast from 'react-native-toast-message';
import { useTheme } from '../ui';

interface Props {
  mediaKey: string;
  filename: string;
  size: number;
  isRight: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

const FileAttachment: React.FC<Props> = ({ mediaKey, filename, size }) => {
  const [downloading, setDownloading] = useState(false);
  const { tokens } = useTheme();

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { url } = await mediaApi.getDownloadUrl(mediaKey);
      if (!url) {
        Alert.alert('Lỗi', 'Không thể tải tệp');
        return;
      }

      const dirs = ReactNativeBlobUtil.fs.dirs;
      const destPath = `${dirs.DownloadDir}/${filename}`;

      const res = await ReactNativeBlobUtil.config({
        path: destPath,
        fileCache: true,
      }).fetch('GET', url);

      // Android: make file visible in file manager
      if (Platform.OS === 'android') {
        try {
          await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
            {
              name: filename,
              parentFolder: '',
              mimeType: '',
            },
            'Download',
            res.path(),
          );
        } catch {
          // copyToMediaStore may fail on older Android, file is still in Downloads
        }
      }

      Toast.show({ type: 'success', text1: 'Đã tải về', visibilityTime: 1500 });
    } catch {
      Alert.alert('Lỗi', 'Không thể tải tệp');
    } finally {
      setDownloading(false);
    }
  };

  // Bubble text sits on chatBubble surfaces (own = primarySoft, other = level1),
  // both of which use semantic.text.primary for legible content in either theme.
  // The old isRight/white split rendered white text on the light-blue own bubble
  // (unreadable in light mode) — token-driven colors fix that and give dark mode.
  const textColor = tokens.semantic.text.primary;
  const subColor = tokens.semantic.text.muted;
  const btnBg = tokens.semantic.surface.level0;

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📄</Text>
      <View style={styles.info}>
        <Text style={[styles.filename, { color: textColor }]} numberOfLines={1}>
          {filename || 'File'}
        </Text>
        <Text style={[styles.size, { color: subColor }]}>
          {formatFileSize(size)}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.downloadBtn, { backgroundColor: btnBg }]}
        onPress={handleDownload}
        disabled={downloading}>
        {downloading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : (
          <Text style={[styles.downloadText, { color: textColor }]}>⬇</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    minWidth: 200,
    maxWidth: 260,
  },
  icon: { fontSize: 28, marginRight: 8 },
  info: { flex: 1 },
  filename: { fontSize: 14, fontWeight: '500' },
  size: { fontSize: 12, marginTop: 2 },
  downloadBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  downloadText: { fontSize: 18 },
});

export default FileAttachment;
