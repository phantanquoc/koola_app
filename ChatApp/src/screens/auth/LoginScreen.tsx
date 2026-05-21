import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import {
  KoolaButton,
  KoolaSurface,
  KoolaText,
  KoolaTextInput,
  koolaColors,
  koolaShadows,
} from '../../ui';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
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
        Alert.alert(
          'Login Failed',
          Array.isArray(msg) ? msg.join('\n') : msg || 'Invalid credentials',
        );
      } else if (error.request) {
        Alert.alert(
          'Connection Error',
          'Cannot reach the server. Please check your internet connection and try again.',
        );
      } else {
        Alert.alert('Error', 'Something went wrong. Please try again.');
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
        <View style={styles.logoMark}>
          <KoolaText variant="title" tone="surface" weight="800">
            K
          </KoolaText>
        </View>
        <KoolaText variant="title" align="center" style={styles.title}>
          Koola Chat
        </KoolaText>
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
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <KoolaTextInput
          label="Mật khẩu"
          icon="lock-outline"
          placeholder="Nhập mật khẩu"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <KoolaButton
          title="Đăng nhập"
          icon="arrow-forward"
          loading={loading}
          onPress={handleLogin}
          style={styles.primaryButton}
        />

        <Pressable
          style={styles.linkButton}
          onPress={() => navigation.navigate('Register')}
          accessibilityRole="button">
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: koolaColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    ...koolaShadows.subtle,
  },
  title: {
    marginBottom: 8,
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
});

export default LoginScreen;
