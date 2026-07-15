import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../services/api/apiService';
import {
  AuthFormShell,
  KoolaBadge,
  KoolaButton,
  KoolaLogo,
  KoolaOtpInput,
  KoolaSurface,
  KoolaText,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'OtpVerify'>;

const OTP_EXPIRY = 300;
const RESEND_COOLDOWN = 45;
const MAX_ATTEMPTS = 5;

const OtpVerifyScreen: React.FC<Props> = ({ route }) => {
  const { email } = route.params;
  const { verifyOtp } = useAuth();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(OTP_EXPIRY);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [attempts, setAttempts] = useState(0);
  const [otpError, setOtpError] = useState('');

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Separate resend cooldown timer (shorter than expiry)
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleVerify = useCallback(async () => {
    setOtpError('');
    if (otp.length !== 6) {
      const errMsg = 'Vui long nhap du 6 so';
      setOtpError(errMsg);
      AccessibilityInfo.announceForAccessibility(errMsg);
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      const errMsg = 'Qua so lan thu. Vui long gui lai ma moi.';
      setOtpError(errMsg);
      AccessibilityInfo.announceForAccessibility(errMsg);
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
      const text = Array.isArray(msg)
        ? msg.join('\n')
        : msg || 'Ma xac thuc khong dung';
      setOtpError(text);
      AccessibilityInfo.announceForAccessibility(text);
    } finally {
      setLoading(false);
    }
  }, [otp, email, verifyOtp, attempts]);

  const handleResend = useCallback(async () => {
    setResending(true);
    try {
      await authApi.resendOtp(email);
      setOtp('');
      setOtpError('');
      setAttempts(0);
      setCountdown(OTP_EXPIRY);
      setResendCooldown(RESEND_COOLDOWN);
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
      const msg = error.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join('\n') : msg || 'Khong the gui lai ma';
      Alert.alert('Gui lai that bai', text);
      AccessibilityInfo.announceForAccessibility(text);
    } finally {
      setResending(false);
    }
  }, [email]);

  const resendDisabled = resending || resendCooldown > 0;

  return (
    <AuthFormShell>
      <KoolaSurface variant="raised" style={styles.form}>
        <View style={styles.header}>
          <KoolaLogo markSize={32} showMark showWordmark={false} />
          <KoolaBadge label="Bao mat" tone="primary" />
          <KoolaText variant="title" align="center">
            Xác thực OTP
          </KoolaText>
          <KoolaText variant="body" tone="muted" align="center">
            Nhập mã 6 số đã gửi đến {email}
          </KoolaText>
        </View>

        <KoolaOtpInput
          value={otp}
          onChange={(v) => { setOtp(v); setOtpError(''); }}
          autoFocus
          error={otpError}
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
          <KoolaText
            align="center"
            style={styles.warningText}
            weight="700">
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
          disabled={resendDisabled}
          hitSlop={{ top: 4, bottom: 4 }}
          accessibilityRole="button"
          accessibilityLabel="Gui lai ma xac thuc"
          accessibilityState={{ disabled: resendDisabled }}>
          <KoolaText
            tone={resendDisabled ? 'faint' : 'primary'}
            weight="800"
            align="center">
            {resending
              ? 'Dang gui lai...'
              : resendCooldown > 0
                ? `Gui lai ma (${resendCooldown}s)`
                : 'Gui lai ma'}
          </KoolaText>
        </Pressable>
      </KoolaSurface>
    </AuthFormShell>
  );
};

// --- Styles ---

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    form: {
      padding: 20,
      gap: 16,
    },
    header: {
      alignItems: 'center',
      gap: 8,
    },
    warningText: {
      color: p.warning,
    },
    resendButton: {
      paddingVertical: 8,
    },
  });

export default OtpVerifyScreen;