import React, { useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import {
  AuthFormShell,
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

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const handleVerifyOtp = async () => {
    setOtpError('');
    if (otp.length !== 6) {
      const errMsg = 'Vui long nhap du ma 6 so';
      setOtpError(errMsg);
      AccessibilityInfo.announceForAccessibility(errMsg);
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
      AccessibilityInfo.announceForAccessibility(text);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setPasswordError('');
    setConfirmError('');
    let valid = true;
    const errors: string[] = [];
    if (newPassword.length < 8) {
      const errMsg = 'Mật khẩu phải có ít nhất 8 ký tự';
      setPasswordError(errMsg);
      errors.push(errMsg);
      valid = false;
    }
    if (newPassword !== confirmPassword) {
      const errMsg = 'Mật khẩu xác nhận không khớp';
      setConfirmError(errMsg);
      errors.push(errMsg);
      valid = false;
    }
    if (!valid) {
      // Focus first invalid
      if (newPassword.length < 8) {
        passwordRef.current?.focus();
      } else {
        confirmRef.current?.focus();
      }
      AccessibilityInfo.announceForAccessibility(errors.join('. '));
      return;
    }
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
      AccessibilityInfo.announceForAccessibility(text);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFormShell>
      <KoolaSurface variant="raised" style={styles.form}>
        <View style={styles.header}>
          <KoolaLogo markSize={32} showMark showWordmark={false} />
          <KoolaBadge label="Bao mat" tone="primary" />
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
              ref={passwordRef}
              label="Mật khẩu mới"
              icon="lock-outline"
              placeholder="Ít nhất 8 ký tự"
              value={newPassword}
              onChangeText={(t) => { setNewPassword(t); setPasswordError(''); }}
              secureTextEntry
              error={passwordError}
              accessibilityLabel="Mat khau moi"
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              blurOnSubmit={false}
            />

            <KoolaTextInput
              ref={confirmRef}
              label="Xác nhận mật khẩu"
              icon="lock-outline"
              placeholder="Nhập lại mật khẩu"
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); setConfirmError(''); }}
              secureTextEntry
              error={confirmError}
              accessibilityLabel="Xac nhan mat khau"
              returnKeyType="go"
              onSubmitEditing={handleResetPassword}
            />

            <KoolaButton
              title="Đặt lại mật khẩu"
              icon="lock-reset"
              loading={loading}
              onPress={handleResetPassword}
            />
          </>
        )}
      </KoolaSurface>
    </AuthFormShell>
  );
};

// --- Styles ---

const makeStyles = (_p: Palette) =>
  StyleSheet.create({
    form: {
      padding: 20,
      gap: 16,
    },
    header: {
      alignItems: 'center',
      gap: 8,
    },
  });

export default ResetPasswordScreen;