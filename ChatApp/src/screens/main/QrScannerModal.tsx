import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Alert,
  AppState,
  BackHandler,
  Linking,
  StatusBar,
} from 'react-native';
import type { AppStateStatus } from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import QRCode from 'react-native-qrcode-svg';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { usersApi, conversationsApi } from '../../services/api/apiService';
import UserAvatar from '../../components/UserAvatar';
import { useTabDockSuppression } from '../../navigation/MainNavigator';
import { KoolaText, useTheme } from '../../ui';
import type { SemanticTokens } from '../../ui/tokens/semantic';

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
  const { tokens } = useTheme();
  const styles = useMemo(() => makeScanStyles(tokens.semantic), [tokens.semantic]);
  const currentUserId = user?._id || '';
  const device = useCameraDevice('back');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const isProcessingRef = useRef(false);

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

  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        setAppActive(true);
        const status = await Camera.getCameraPermissionStatus();
        setHasPermission(status === 'granted');
      } else {
        setAppActive(false);
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const release = useCallback(() => {
    isProcessingRef.current = false;
    setIsProcessing(false);
  }, []);

  const handleScanned = useCallback(
    async (value: string) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      setIsProcessing(true);

      try {
        if (!OBJECT_ID_REGEX.test(value)) {
          Alert.alert('Mã QR không hợp lệ', '', [
            { text: 'OK', onPress: release },
          ], { cancelable: false });
          return;
        }

        if (value === currentUserId) {
          Alert.alert('Bạn không thể quét mã của chính mình', '', [
            { text: 'OK', onPress: release },
          ], { cancelable: false });
          return;
        }

        const foundUser = await usersApi.getUserById(value);
        if (!foundUser) {
          Alert.alert('Không tìm thấy người dùng', '', [
            { text: 'OK', onPress: release },
          ], { cancelable: false });
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
                Alert.alert('Lỗi', 'Không thể bắt đầu cuộc trò chuyện', [
                  { text: 'OK', onPress: release },
                ], { cancelable: false });
              }
            },
          },
          {
            text: 'Hủy',
            style: 'cancel',
            onPress: release,
          },
        ], { cancelable: false });
      } catch (err: any) {
        const is404 = err?.response?.status === 404;
        Alert.alert(
          is404 ? 'Không tìm thấy người dùng' : 'Lỗi',
          is404 ? '' : 'Đã xảy ra lỗi khi xử lý mã QR',
          [{ text: 'OK', onPress: release }],
          { cancelable: false },
        );
      }
    },
    [currentUserId, onClose, onNavigateProfile, onNavigateChat, release],
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
      <View style={styles.centered}>
        <MaterialIcons name="no-photography" size={64} color={tokens.semantic.border.subtle} />
        <KoolaText tone="muted" style={styles.permText}>Cần quyền camera để quét mã QR</KoolaText>
        <Pressable
          style={styles.settingsBtn}
          onPress={() => Linking.openSettings()}
          accessibilityRole="button"
          accessibilityLabel="Mở cài đặt">
          <KoolaText weight="600" style={styles.settingsBtnText}>Mở Cài đặt</KoolaText>
        </Pressable>
      </View>
    );
  }

  if (hasPermission === null || !device) {
    return (
      <View style={styles.centered}>
        <KoolaText tone="muted">Đang khởi tạo camera...</KoolaText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!isProcessing && appActive}
        codeScanner={codeScanner}
      />
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <KoolaText style={styles.hint}>Đưa mã QR vào khung hình</KoolaText>
      </View>
    </View>
  );
};

const makeScanStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: semantic.bg.canvas, padding: 24 },
    permText: { textAlign: 'center', marginTop: 16 },
    settingsBtn: {
      marginTop: 20, paddingHorizontal: 24, paddingVertical: 12,
      backgroundColor: semantic.action.primary, borderRadius: 8,
    },
    settingsBtnText: { color: semantic.text.onAction },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    frame: {
      width: 250, height: 250, borderWidth: 2, borderColor: '#fff',
      borderRadius: 16, backgroundColor: 'transparent',
    },
    hint: { color: '#fff', marginTop: 16 },
  });

// ─── My QR Code Tab ─────────────────────────────────────────────────────────

const MyQrTab: React.FC = () => {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeQrStyles(tokens.semantic), [tokens.semantic]);

  if (!user) {
    return (
      <View style={styles.centered}>
        <KoolaText tone="muted">Không thể tải mã QR</KoolaText>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <UserAvatar displayName={user.displayName} avatar={user.avatar || undefined} size={80} />
      <KoolaText variant="heading" style={styles.name}>{user.displayName}</KoolaText>
      <View style={styles.qrContainer}>
        <QRCode value={user._id} size={200} backgroundColor="#fff" color="#000" />
      </View>
      <KoolaText variant="caption" tone="muted" style={styles.hint}>Để người khác quét mã này để kết nối</KoolaText>
    </View>
  );
};

const makeQrStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: semantic.bg.canvas, padding: 24 },
    name: { marginTop: 12 },
    qrContainer: {
      marginTop: 24, padding: 20, backgroundColor: '#fff', borderRadius: 16,
      elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1, shadowRadius: 8,
    },
    hint: { marginTop: 16 },
  });

// ─── Modal ──────────────────────────────────────────────────────────────────

const QrScannerModal: React.FC<QrScannerModalProps> = ({
  visible,
  onClose,
  onNavigateProfile,
  onNavigateChat,
}) => {
  const [activeTab, setActiveTab] = useState<'scan' | 'myqr'>('scan');
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeModalStyles(tokens.semantic), [tokens.semantic]);
  const suppressTabDock = useTabDockSuppression();

  useEffect(() => {
    if (!visible) return undefined;
    return suppressTabDock();
  }, [suppressTabDock, visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => handler.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <View style={styles.overlayHost}>
      <View style={styles.container}>
        <StatusBar backgroundColor={tokens.semantic.surface.level0} barStyle="dark-content" />
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerSide} />
          <KoolaText variant="heading" weight="600">Mã QR</KoolaText>
          <Pressable
            onPress={onClose}
            style={styles.headerSide}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Đóng">
            <MaterialIcons name="close" size={26} color={tokens.semantic.text.primary} />
          </Pressable>
        </View>
        {/* Tab Bar */}
        <View style={styles.tabBar} accessibilityRole="tablist">
          <Pressable
            style={[styles.tab, activeTab === 'scan' && styles.tabActive]}
            onPress={() => setActiveTab('scan')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'scan' }}
            accessibilityLabel="Quét QR">
            <KoolaText
              weight="600"
              style={activeTab === 'scan' ? styles.tabTextActive : styles.tabTextInactive}>
              Quét QR
            </KoolaText>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'myqr' && styles.tabActive]}
            onPress={() => setActiveTab('myqr')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'myqr' }}
            accessibilityLabel="Mã QR của tôi">
            <KoolaText
              weight="600"
              style={activeTab === 'myqr' ? styles.tabTextActive : styles.tabTextInactive}>
              Mã QR của tôi
            </KoolaText>
          </Pressable>
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
    </View>
  );
};

const makeModalStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    overlayHost: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1000,
      elevation: 1000,
      backgroundColor: semantic.bg.canvas,
    },
    container: { flex: 1, backgroundColor: semantic.bg.canvas },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: semantic.border.subtle,
    },
    headerSide: { width: 34, alignItems: 'center' },
    tabBar: {
      flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: semantic.border.subtle,
    },
    tab: {
      flex: 1, paddingVertical: 12, alignItems: 'center',
      borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: semantic.action.primary },
    tabTextActive: { color: semantic.action.primary },
    tabTextInactive: { color: semantic.text.muted },
  });

export default QrScannerModal;
