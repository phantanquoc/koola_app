import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import {
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

  const handleSubmit = async () => {
    setEmailError('');
    if (!email.trim()) {
      setEmailError('Vui lòng nhập email');
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
      } else {
        Alert.alert('Lỗi', text);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    navigation.navigate('ResetPassword', { email: email.trim().toLowerCase() });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
              label="Email"
              icon="mail-outline"
              placeholder="you@example.com"
              value={email}
              onChangeText={(t) => { setEmail(t); setEmailError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {emailError ? (
              <KoolaText variant="caption" style={styles.fieldError}>
                {emailError}
              </KoolaText>
            ) : null}

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
              Nếu email tồn tại, mã xác thực đã được gửi. Vui lòng kiểm tra hộp
              thư của bạn.
            </KoolaText>

            <KoolaButton
              title="Nhập mã xác thực"
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
          accessibilityLabel="Quay lại đăng nhập">
          <KoolaText tone="primary" weight="800" align="center">
            Quay lại đăng nhập
          </KoolaText>
        </Pressable>
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
    primaryButton: {
      marginTop: 4,
    },
    linkButton: {
      paddingVertical: 8,
    },
    fieldError: {
      color: p.danger,
      marginTop: -8,
      marginLeft: 4,
    },
  });

export default ForgotPasswordScreen;