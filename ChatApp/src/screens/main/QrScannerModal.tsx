import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Linking,
  StatusBar,
} from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import QRCode from 'react-native-qrcode-svg';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../../contexts/AuthContext';
import { usersApi, conversationsApi } from '../../services/api/apiService';
import UserAvatar from '../../components/UserAvatar';

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

interface QrScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onNavigateProfile: (userId: string) => void;
  onNavigateChat: (conversationId: string) => void;
}

// ─── Scanner Tab ────────────────────────────────────────────────────────────

const ScannerTab: React.FC<{
  onClose: () => void;
  onNavigateProfile: (userId: string) => void;
  onNavigateChat: (conversationId: string) => void;
}> = ({ onClose, onNavigateProfile, onNavigateChat }) => {
  const { user } = useAuth();
  const currentUserId = user?._id || '';
  const device = useCameraDevice('back');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    (async () => {
      const status = await Camera.getCameraPermissionStatus();
      if (status === 'granted') {
        setHasPermission(true);
      } else if (status === 'not-determined') {
        const result = await Camera.requestCameraPermission();
        setHasPermission(result === 'granted');
      } else {
        setHasPermission(false);
      }
    })();
  }, []);

  const handleScanned = useCallback(
    async (value: string) => {
      if (isProcessing) return;
      setIsProcessing(true);

      try {
        if (!OBJECT_ID_REGEX.test(value)) {
          Alert.alert('Mã QR không hợp lệ', '', [
            { text: 'OK', onPress: () => setIsProcessing(false) },
          ]);
          return;
        }

        if (value === currentUserId) {
          Alert.alert('Bạn không thể quét mã của chính mình', '', [
            { text: 'OK', onPress: () => setIsProcessing(false) },
          ]);
          return;
        }

        const foundUser = await usersApi.getUserById(value);
        if (!foundUser) {
          Alert.alert('Không tìm thấy người dùng', '', [
            { text: 'OK', onPress: () => setIsProcessing(false) },
          ]);
          return;
        }

        Alert.alert(foundUser.displayName, '', [
          {
            text: 'Xem hồ sơ',
            onPress: () => {
              onClose();
              setTimeout(() => onNavigateProfile(value), 300);
            },
          },
          {
            text: 'Nhắn tin',
            onPress: async () => {
              try {
                const { conversation } = await conversationsApi.startDirectChat(value);
                onClose();
                setTimeout(() => onNavigateChat(conversation._id), 300);
              } catch {
                Alert.alert('Lỗi', 'Không thể bắt đầu cuộc trò chuyện');
                setIsProcessing(false);
              }
            },
          },
          {
            text: 'Hủy',
            style: 'cancel',
            onPress: () => setIsProcessing(false),
          },
        ]);
      } catch (err: any) {
        const is404 = err?.response?.status === 404;
        Alert.alert(
          is404 ? 'Không tìm thấy người dùng' : 'Lỗi',
          is404 ? '' : 'Đã xảy ra lỗi khi xử lý mã QR',
          [{ text: 'OK', onPress: () => setIsProcessing(false) }],
        );
      }
    },
    [currentUserId, isProcessing, onClose, onNavigateProfile, onNavigateChat],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (codes.length > 0 && codes[0].value) {
        handleScanned(codes[0].value);
      }
    },
  });

  if (hasPermission === false) {
    return (
      <View style={scanStyles.centered}>
        <MaterialIcons name="no-photography" size={64} color="#ccc" />
        <Text style={scanStyles.permText}>Cần quyền camera để quét mã QR</Text>
        <TouchableOpacity
          style={scanStyles.settingsBtn}
          onPress={() => Linking.openSettings()}>
          <Text style={scanStyles.settingsBtnText}>Mở Cài đặt</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (hasPermission === null || !device) {
    return (
      <View style={scanStyles.centered}>
        <Text style={scanStyles.permText}>Đang khởi tạo camera...</Text>
      </View>
    );
  }

  return (
    <View style={scanStyles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!isProcessing}
        codeScanner={codeScanner}
      />
      <View style={scanStyles.overlay}>
        <View style={scanStyles.frame} />
        <Text style={scanStyles.hint}>Đưa mã QR vào khung hình</Text>
      </View>
    </View>
  );
};

const scanStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 24 },
  permText: { fontSize: 16, color: '#666', textAlign: 'center', marginTop: 16 },
  settingsBtn: {
    marginTop: 20, paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: '#2196F3', borderRadius: 8,
  },
  settingsBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frame: {
    width: 250, height: 250, borderWidth: 2, borderColor: '#fff',
    borderRadius: 16, backgroundColor: 'transparent',
  },
  hint: { color: '#fff', fontSize: 14, marginTop: 16 },
});

// ─── My QR Code Tab ─────────────────────────────────────────────────────────

const MyQrTab: React.FC = () => {
  const { user } = useAuth();

  if (!user) {
    return (
      <View style={qrStyles.centered}>
        <Text style={qrStyles.fallback}>Không thể tải mã QR</Text>
      </View>
    );
  }

  return (
    <View style={qrStyles.centered}>
      <UserAvatar displayName={user.displayName} avatar={user.avatar || undefined} size={80} />
      <Text style={qrStyles.name}>{user.displayName}</Text>
      <View style={qrStyles.qrContainer}>
        <QRCode value={user._id} size={200} backgroundColor="#fff" color="#000" />
      </View>
      <Text style={qrStyles.hint}>Để người khác quét mã này để kết nối</Text>
    </View>
  );
};

const qrStyles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 24 },
  fallback: { fontSize: 16, color: '#999' },
  name: { fontSize: 20, fontWeight: '600', color: '#333', marginTop: 12 },
  qrContainer: {
    marginTop: 24, padding: 20, backgroundColor: '#fff', borderRadius: 16,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8,
  },
  hint: { fontSize: 13, color: '#999', marginTop: 16 },
});

// ─── Modal ──────────────────────────────────────────────────────────────────

const QrScannerModal: React.FC<QrScannerModalProps> = ({
  visible,
  onClose,
  onNavigateProfile,
  onNavigateChat,
}) => {
  const [activeTab, setActiveTab] = useState<'scan' | 'myqr'>('scan');

  // Fabric-safe: do not mount native <Modal> (Dialog Window) until visible.
  // Eager mount with visible=false races RN's removeViewAt on Android Fabric.
  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <StatusBar backgroundColor="#fff" barStyle="dark-content" />
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Mã QR</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <MaterialIcons name="close" size={26} color="#333" />
          </TouchableOpacity>
        </View>
        {/* Tab Bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'scan' && styles.tabActive]}
            onPress={() => setActiveTab('scan')}>
            <Text style={[styles.tabText, activeTab === 'scan' && styles.tabTextActive]}>
              Quét QR
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'myqr' && styles.tabActive]}
            onPress={() => setActiveTab('myqr')}>
            <Text style={[styles.tabText, activeTab === 'myqr' && styles.tabTextActive]}>
              Mã QR của tôi
            </Text>
          </TouchableOpacity>
        </View>
        {/* Content */}
        {activeTab === 'scan' ? (
          <ScannerTab
            onClose={onClose}
            onNavigateProfile={onNavigateProfile}
            onNavigateChat={onNavigateChat}
          />
        ) : (
          <MyQrTab />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingVertical: 12, paddingTop: (StatusBar.currentHeight || 0) + 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  closeBtn: { position: 'absolute', right: 16, top: (StatusBar.currentHeight || 0) + 10, padding: 4 },
  tabBar: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#2196F3' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#999' },
  tabTextActive: { color: '#2196F3' },
});

export default QrScannerModal;
