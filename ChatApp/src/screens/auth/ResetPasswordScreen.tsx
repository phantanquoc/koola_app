import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import {
  KoolaBadge,
  KoolaButton,
  KoolaSurface,
  KoolaText,
  KoolaTextInput,
  koolaColors,
  koolaRadii,
} from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

type Step = 'otp' | 'newPassword';

const ResetPasswordScreen: React.FC<Props> = ({ route, navigation }) => {
  const { email } = route.params;
  const { verifyResetOtp, resetPassword } = useAuth();

  const [step, setStep] = useState<Step>('otp');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit code');
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
      Alert.alert(
        'Verification Failed',
        Array.isArray(msg) ? msg.join('\n') : msg || 'Invalid code',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(resetToken, newPassword);
      Alert.alert(
        'Thanh cong',
        'Mat khau da duoc dat lai. Vui long dang nhap lai.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }],
      );
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
      const msg = error.response?.data?.message;
      Alert.alert(
        'Error',
        Array.isArray(msg) ? msg.join('\n') : msg || 'Something went wrong',
      );
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
          <KoolaBadge label="Bao mat" tone="primary" />
          <KoolaText variant="title" align="center">
            {step === 'otp' ? 'Nhap ma xac thuc' : 'Dat mat khau moi'}
          </KoolaText>
          <KoolaText variant="body" tone="muted" align="center">
            {step === 'otp'
              ? `Nhap ma 6 so da gui den ${email}`
              : 'Nhap mat khau moi (it nhat 8 ky tu)'}
          </KoolaText>
        </View>

        {step === 'otp' ? (
          <>
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

            <KoolaButton
              title="Xac thuc"
              icon="verified-user"
              loading={loading}
              onPress={handleVerifyOtp}
            />
          </>
        ) : (
          <>
            <KoolaTextInput
              label="Mat khau moi"
              icon="lock-outline"
              placeholder="It nhat 8 ky tu"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
            <KoolaTextInput
              label="Xac nhan mat khau"
              icon="lock-outline"
              placeholder="Nhap lai mat khau"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />

            <KoolaButton
              title="Dat lai mat khau"
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
});

export default ResetPasswordScreen;
