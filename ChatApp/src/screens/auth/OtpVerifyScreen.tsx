import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../services/api/apiService';

type Props = NativeStackScreenProps<AuthStackParamList, 'OtpVerify'>;

const OTP_EXPIRY = 300; // 5 minutes
const MAX_ATTEMPTS = 5;

const OtpVerifyScreen: React.FC<Props> = ({ route, navigation }) => {
  const { email } = route.params;
  const { verifyOtp } = useAuth();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(OTP_EXPIRY);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleVerify = useCallback(async () => {
    if (otp.length !== 6) {
      Alert.alert('Lỗi', 'Vui lòng nhập đủ 6 số');
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      Alert.alert('Lỗi', 'Quá số lần thử. Vui lòng gửi lại mã mới.');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(email, otp);
      Alert.alert('Thành công', 'Đăng ký thành công! Vui lòng đăng nhập.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (err: unknown) {
      setAttempts((prev) => prev + 1);
      const error = err as { response?: { data?: { message?: string | string[] } } };
      const msg = error.response?.data?.message;
      Alert.alert(
        'Xác thực thất bại',
        Array.isArray(msg) ? msg.join('\n') : msg || 'Mã xác thực không đúng',
      );
    } finally {
      setLoading(false);
    }
  }, [otp, email, verifyOtp, navigation, attempts]);

  const handleResend = useCallback(async () => {
    setResending(true);
    try {
      await authApi.resendOtp(email);
      setOtp('');
      setAttempts(0);
      setCountdown(OTP_EXPIRY);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string | string[] } } };
      const msg = error.response?.data?.message;
      Alert.alert(
        'Gửi lại thất bại',
        Array.isArray(msg) ? msg.join('\n') : msg || 'Không thể gửi lại mã',
      );
    } finally {
      setResending(false);
    }
  }, [email]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.form}>
        <Text style={styles.title}>Xác thực OTP</Text>
        <Text style={styles.subtitle}>
          Nhập mã 6 số đã gửi đến {email}
        </Text>

        <TextInput
          style={styles.otpInput}
          placeholder="000000"
          placeholderTextColor="#ccc"
          value={otp}
          onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          autoFocus
        />

        {countdown > 0 ? (
          <Text style={styles.countdown}>
            Mã hết hạn sau: {formatTime(countdown)}
          </Text>
        ) : (
          <Text style={styles.expired}>Mã đã hết hạn</Text>
        )}

        {attempts > 0 && attempts < MAX_ATTEMPTS && (
          <Text style={styles.attempts}>
            Còn {MAX_ATTEMPTS - attempts} lần thử
          </Text>
        )}

        <TouchableOpacity
          style={[styles.button, (loading || countdown <= 0) && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading || countdown <= 0}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Xác thực</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resendButton, (resending || countdown > 0) && styles.resendDisabled]}
          onPress={handleResend}
          disabled={resending || countdown > 0}>
          {resending ? (
            <ActivityIndicator color="#2196F3" size="small" />
          ) : (
            <Text style={[styles.resendText, countdown > 0 && styles.resendTextDisabled]}>
              Gửi lại mã {countdown > 0 ? `(${formatTime(countdown)})` : ''}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', justifyContent: 'center' },
  form: { paddingHorizontal: 32 },
  title: {
    fontSize: 28, fontWeight: 'bold', textAlign: 'center',
    color: '#2196F3', marginBottom: 4,
  },
  subtitle: {
    fontSize: 14, textAlign: 'center', color: '#999', marginBottom: 32,
  },
  otpInput: {
    height: 56, borderWidth: 2, borderColor: '#2196F3', borderRadius: 12,
    paddingHorizontal: 16, fontSize: 28, letterSpacing: 12,
    marginBottom: 16, color: '#333', fontWeight: '600',
  },
  countdown: {
    textAlign: 'center', color: '#666', fontSize: 14, marginBottom: 8,
  },
  expired: {
    textAlign: 'center', color: '#F44336', fontSize: 14, marginBottom: 8,
  },
  attempts: {
    textAlign: 'center', color: '#FF9800', fontSize: 13, marginBottom: 8,
  },
  button: {
    height: 48, backgroundColor: '#2196F3', borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resendButton: { marginTop: 16, alignItems: 'center', padding: 8 },
  resendDisabled: { opacity: 0.5 },
  resendText: { color: '#2196F3', fontSize: 14, fontWeight: '600' },
  resendTextDisabled: { color: '#999' },
});

export default OtpVerifyScreen;
