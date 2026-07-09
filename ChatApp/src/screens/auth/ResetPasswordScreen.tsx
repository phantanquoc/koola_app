import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import {
  KoolaBadge,
  KoolaButton,
  KoolaLogo,
  KoolaOtpInput,
  KoolaSurface,
  KoolaText,
  KoolaTextInput,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

type Step = 'otp' | 'newPassword';

const ResetPasswordScreen: React.FC<Props> = ({ route, navigation }) => {
  const { email } = route.params;
  const { verifyResetOtp, resetPassword } = useAuth();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [step, setStep] = useState<Step>('otp');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const handleVerifyOtp = async () => {
    setOtpError('');
    if (otp.length !== 6) {
      setOtpError('Vui lòng nhập đủ mã 6 số');
      return;
    }
    setLoading(true);
    try {
      const result = await verifyResetOtp(email, otp);
      setResetToken(result.resetToken);
      setStep('newPassword');
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
      const msg = error.response?.data?.message;
      const text = Array.isArray(msg)
        ? msg.join('\n')
        : msg || 'Mã xác thực không đúng';
      setOtpError(text);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setPasswordError('');
    setConfirmError('');
    let valid = true;
    if (newPassword.length < 8) {
      setPasswordError('Mật khẩu phải có ít nhất 8 ký tự');
      valid = false;
    }
    if (newPassword !== confirmPassword) {
      setConfirmError('Mật khẩu xác nhận không khớp');
      valid = false;
    }
    if (!valid) return;
    setLoading(true);
    try {
      await resetPassword(resetToken, newPassword);
      Alert.alert(
        'Thành công',
        'Mật khẩu đã được đặt lại. Vui lòng đăng nhập lại.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }],
      );
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
      const msg = error.response?.data?.message;
      const text = Array.isArray(msg)
        ? msg.join('\n')
        : msg || 'Đã xảy ra lỗi';
      Alert.alert('Lỗi', text);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <KoolaSurface variant="raised" style={styles.form}>
        <View style={styles.header}>
          <KoolaLogo markSize={32} showMark showWordmark={false} />
          <KoolaBadge label="Bảo mật" tone="primary" />
          <KoolaText variant="title" align="center">
            {step === 'otp' ? 'Nhập mã xác thực' : 'Đặt mật khẩu mới'}
          </KoolaText>
          <KoolaText variant="body" tone="muted" align="center">
            {step === 'otp'
              ? `Nhập mã 6 số đã gửi đến ${email}`
              : 'Nhập mật khẩu mới (ít nhất 8 ký tự)'}
          </KoolaText>
        </View>

        {step === 'otp' ? (
          <>
            <KoolaOtpInput
              value={otp}
              onChange={(v) => { setOtp(v); setOtpError(''); }}
              autoFocus
              error={otpError}
            />

            <KoolaButton
              title="Xác thực"
              icon="verified-user"
              loading={loading}
              onPress={handleVerifyOtp}
            />
          </>
        ) : (
          <>
            <KoolaTextInput
              label="Mật khẩu mới"
              icon="lock-outline"
              placeholder="Ít nhất 8 ký tự"
              value={newPassword}
              onChangeText={(t) => { setNewPassword(t); setPasswordError(''); }}
              secureTextEntry
            />
            {passwordError ? (
              <KoolaText variant="caption" style={styles.fieldError}>
                {passwordError}
              </KoolaText>
            ) : null}

            <KoolaTextInput
              label="Xác nhận mật khẩu"
              icon="lock-outline"
              placeholder="Nhập lại mật khẩu"
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); setConfirmError(''); }}
              secureTextEntry
            />
            {confirmError ? (
              <KoolaText variant="caption" style={styles.fieldError}>
                {confirmError}
              </KoolaText>
            ) : null}

            <KoolaButton
              title="Đặt lại mật khẩu"
              icon="lock-reset"
              loading={loading}
              onPress={handleResetPassword}
            />
          </>
        )}
      </KoolaSurface>
    </KeyboardAvoidingView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.canvas,
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
    fieldError: {
      color: p.danger,
      marginTop: -8,
      marginLeft: 4,
    },
  });

export default ResetPasswordScreen;