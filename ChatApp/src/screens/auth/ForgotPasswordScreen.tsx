import React, { useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import {
  AuthFormShell,
  KoolaButton,
  KoolaLogo,
  KoolaSurface,
  KoolaText,
  KoolaTextInput,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

const ForgotPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const { forgotPassword } = useAuth();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState('');

  const emailRef = useRef<TextInput>(null);

  const handleSubmit = async () => {
    setEmailError('');
    if (!email.trim()) {
      setEmailError('Vui lòng nhập email');
      emailRef.current?.focus();
      AccessibilityInfo.announceForAccessibility('Vui long nhap email');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
      const msg = error.response?.data?.message;
      const text = Array.isArray(msg)
        ? msg.join('\n')
        : msg || 'Đã xảy ra lỗi';
      if (text.toLowerCase().includes('email') || text.toLowerCase().includes('not found')) {
        setEmailError(text);
        emailRef.current?.focus();
      } else {
        Alert.alert('Lỗi', text);
      }
      AccessibilityInfo.announceForAccessibility(text);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    navigation.navigate('ResetPassword', { email: email.trim().toLowerCase() });
  };

  return (
    <AuthFormShell>
      <KoolaSurface variant="raised" style={styles.form}>
        <View style={styles.header}>
          <KoolaLogo markSize={32} showMark showWordmark={false} />
          <KoolaText variant="title" align="center">
            Quên mật khẩu
          </KoolaText>
          <KoolaText variant="body" tone="muted" align="center">
            Nhập email để nhận mã xác thực đặt lại mật khẩu.
          </KoolaText>
        </View>

        {!sent ? (
          <>
            <KoolaTextInput
              ref={emailRef}
              label="Email"
              icon="mail-outline"
              placeholder="you@example.com"
              value={email}
              onChangeText={(t) => { setEmail(t); setEmailError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={emailError}
              accessibilityLabel="Email"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />

            <KoolaButton
              title="Gửi mã xác thực"
              icon="send"
              loading={loading}
              onPress={handleSubmit}
              style={styles.primaryButton}
            />
          </>
        ) : (
          <>
            <KoolaText variant="body" align="center">
              Neu email ton tai, ma xac thuc da duoc gui. Vui long kiem tra hop
              thu cua ban.
            </KoolaText>

            <KoolaButton
              title="Nhap ma xac thuc"
              icon="arrow-forward"
              onPress={handleContinue}
              style={styles.primaryButton}
            />
          </>
        )}

        <Pressable
          style={styles.linkButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 4, bottom: 4 }}
          accessibilityRole="link"
          accessibilityLabel="Quay lai dang nhap">
          <KoolaText tone="primary" weight="800" align="center">
            Quay lai dang nhap
          </KoolaText>
        </Pressable>
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
    primaryButton: {
      marginTop: 4,
    },
    linkButton: {
      paddingVertical: 8,
    },
  });

export default ForgotPasswordScreen;