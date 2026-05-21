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
} from '../../ui';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email.trim() || !password.trim() || !displayName.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await register(email.trim().toLowerCase(), password, displayName.trim());
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
      const msg = error.response?.data?.message;
      Alert.alert(
        'Registration Failed',
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
      <View style={styles.hero}>
        <KoolaText variant="title" align="center">
          Tạo tài khoản
        </KoolaText>
        <KoolaText variant="body" tone="muted" align="center">
          Bắt đầu trò chuyện và kết nối với cộng đồng Koola.
        </KoolaText>
      </View>

      <KoolaSurface variant="raised" style={styles.form}>
        <KoolaTextInput
          label="Tên hiển thị"
          icon="person-outline"
          placeholder="Nguyễn Văn A"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
        />
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
          placeholder="Ít nhất 6 ký tự"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <KoolaButton
          title="Tạo tài khoản"
          icon="person-add-alt"
          loading={loading}
          onPress={handleRegister}
          style={styles.primaryButton}
        />

        <Pressable
          style={styles.linkButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button">
          <KoolaText tone="muted" align="center">
            Đã có tài khoản?{' '}
            <KoolaText tone="primary" weight="800">
              Đăng nhập
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
    gap: 8,
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  form: {
    padding: 20,
    gap: 14,
  },
  primaryButton: {
    marginTop: 4,
  },
  linkButton: {
    paddingVertical: 8,
  },
});

export default RegisterScreen;
