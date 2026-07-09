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

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { login } = useAuth();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validate = (): boolean => {
    let valid = true;
    setEmailError('');
    setPasswordError('');
    if (!email.trim()) {
      setEmailError('Vui lòng nhập email');
      valid = false;
    }
    if (!password.trim()) {
      setPasswordError('Vui lòng nhập mật khẩu');
      valid = false;
    }
    return valid;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
        request?: unknown;
      };
      if (error.response) {
        const msg = error.response.data?.message;
        const text = Array.isArray(msg)
          ? msg.join('\n')
          : msg || 'Thông tin đăng nhập không đúng';
        setPasswordError(text);
      } else if (error.request) {
        Alert.alert(
          'Lỗi kết nối',
          'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.',
        );
      } else {
        Alert.alert('Lỗi', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.hero}>
        <KoolaLogo
          markSize={40}
          showMark
          showWordmark
          variant="extruded"
          style={styles.logo}
        />
        <KoolaText variant="body" tone="muted" align="center">
          Tin nhắn, cuộc gọi và kết nối công việc trong một không gian gọn gàng.
        </KoolaText>
      </View>

      <KoolaSurface variant="raised" style={styles.form}>
        <KoolaText variant="heading" weight="800">
          Đăng nhập
        </KoolaText>
        <KoolaText tone="muted" style={styles.formHint}>
          Tiếp tục với tài khoản Koola của bạn.
        </KoolaText>

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

        <KoolaTextInput
          label="Mật khẩu"
          icon="lock-outline"
          placeholder="Nhập mật khẩu"
          value={password}
          onChangeText={(t) => { setPassword(t); setPasswordError(''); }}
          secureTextEntry
        />
        {passwordError ? (
          <KoolaText variant="caption" style={styles.fieldError}>
            {passwordError}
          </KoolaText>
        ) : null}

        <KoolaButton
          title="Đăng nhập"
          icon="arrow-forward"
          loading={loading}
          onPress={handleLogin}
          style={styles.primaryButton}
        />

        <Pressable
          style={styles.linkButton}
          onPress={() => navigation.navigate('ForgotPassword')}
          hitSlop={{ top: 4, bottom: 4 }}
          accessibilityRole="link"
          accessibilityLabel="Quên mật khẩu?">
          <KoolaText tone="primary" weight="800" align="center">
            Quên mật khẩu?
          </KoolaText>
        </Pressable>

        <Pressable
          style={styles.linkButton}
          onPress={() => navigation.navigate('Register')}
          hitSlop={{ top: 4, bottom: 4 }}
          accessibilityRole="link"
          accessibilityLabel="Tạo tài khoản mới">
          <KoolaText tone="muted" align="center">
            Chưa có tài khoản?{' '}
            <KoolaText tone="primary" weight="800">
              Tạo tài khoản
            </KoolaText>
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
    hero: {
      alignItems: 'center',
      marginBottom: 22,
      paddingHorizontal: 8,
    },
    logo: {
      marginBottom: 14,
    },
    form: {
      padding: 20,
      gap: 14,
    },
    formHint: {
      marginTop: -8,
      marginBottom: 2,
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

export default LoginScreen;
