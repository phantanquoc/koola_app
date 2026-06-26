import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../services/api/apiService';
import {
  KoolaBadge,
  KoolaButton,
  KoolaSurface,
  KoolaText,
  koolaColors,
  koolaRadii,
} from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'OtpVerify'>;

const OTP_EXPIRY = 300;
const MAX_ATTEMPTS = 5;

const OtpVerifyScreen: React.FC<Props> = ({ route }) => {
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
      // Auto-login: verifyOtp sets tokens + user in AuthContext,
      // RootNavigator swaps to the authenticated group automatically.
    } catch (err: unknown) {
      setAttempts((prev) => prev + 1);
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
      const msg = error.response?.data?.message;
      Alert.alert(
        'Xác thực thất bại',
        Array.isArray(msg) ? msg.join('\n') : msg || 'Mã xác thực không đúng',
      );
    } finally {
      setLoading(false);
    }
  }, [otp, email, verifyOtp, attempts]);

  const handleResend = useCallback(async () => {
    setResending(true);
    try {
      await authApi.resendOtp(email);
      setOtp('');
      setAttempts(0);
      setCountdown(OTP_EXPIRY);
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
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
      <KoolaSurface variant="raised" style={styles.form}>
        <View style={styles.header}>
          <KoolaBadge label="Bảo mật" tone="primary" />
          <KoolaText variant="title" align="center">
            Xác thực OTP
          </KoolaText>
          <KoolaText variant="body" tone="muted" align="center">
            Nhập mã 6 số đã gửi đến {email}
          </KoolaText>
        </View>

        <TextInput
          style={styles.otpInput}
          placeholder="000000"
          placeholderTextColor={koolaColors.faint}
          value={otp}
          onChangeText={(text) =>
            setOtp(text.replace(/[^0-9]/g, '').slice(0, 6))
          }
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          autoFocus
        />

        <KoolaText
          align="center"
          tone={countdown > 0 ? 'muted' : 'danger'}
          weight="700">
          {countdown > 0
            ? `Mã hết hạn sau: ${formatTime(countdown)}`
            : 'Mã đã hết hạn'}
        </KoolaText>

        {attempts > 0 && attempts < MAX_ATTEMPTS ? (
          <KoolaText align="center" style={styles.warningText} weight="700">
            Còn {MAX_ATTEMPTS - attempts} lần thử
          </KoolaText>
        ) : null}

        <KoolaButton
          title="Xác thực"
          icon="verified-user"
          loading={loading}
          onPress={handleVerify}
          disabled={loading || countdown <= 0}
        />

        <Pressable
          style={styles.resendButton}
          onPress={handleResend}
          disabled={resending || countdown > 0}
          accessibilityRole="button">
          <KoolaText
            tone={countdown > 0 ? 'faint' : 'primary'}
            weight="800"
            align="center">
            {resending
              ? 'Đang gửi lại...'
              : `Gửi lại mã ${countdown > 0 ? `(${formatTime(countdown)})` : ''}`}
          </KoolaText>
        </Pressable>
      </KoolaSurface>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  form: {
    padding: 20,
    gap: 16,
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  otpInput: {
    height: 58,
    borderWidth: 2,
    borderColor: koolaColors.primary,
    borderRadius: koolaRadii.md,
    paddingHorizontal: 16,
    fontSize: 28,
    letterSpacing: 10,
    color: koolaColors.ink,
    fontWeight: '800',
    backgroundColor: koolaColors.surface,
  },
  warningText: {
    color: koolaColors.warning,
  },
  resendButton: {
    paddingVertical: 8,
  },
});

export default OtpVerifyScreen;
