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

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { registerInit } = useAuth();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validate = (): boolean => {
    let valid = true;
    setNameError('');
    setEmailError('');
    setPasswordError('');
    if (!displayName.trim()) {
      setNameError('Vui lòng nhập tên hiển thị');
      valid = false;
    }
    if (!email.trim()) {
      setEmailError('Vui lòng nhập email');
      valid = false;
    }
    if (!password.trim()) {
      setPasswordError('Vui lòng nhập mật khẩu');
      valid = false;
    } else if (password.length < 8) {
      setPasswordError('Mật khẩu phải có ít nhất 8 ký tự');
      valid = false;
    }
    return valid;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await registerInit({
        email: email.trim().toLowerCase(),
        password,
        displayName: displayName.trim(),
      });
      navigation.navigate('OtpVerify', { email: email.trim().toLowerCase() });
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
      const msg = error.response?.data?.message;
      const text = Array.isArray(msg)
        ? msg.join('\n')
        : msg || 'Đã xảy ra lỗi';
      if (text.toLowerCase().includes('email')) {
        setEmailError(text);
      } else {
        Alert.alert('Đăng ký thất bại', text);
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
          markSize={36}
          showMark
          showWordmark={false}
          style={styles.logo}
        />
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
          onChangeText={(t) => { setDisplayName(t); setNameError(''); }}
          autoCapitalize="words"
        />
        {nameError ? (
          <KoolaText variant="caption" style={styles.fieldError}>
            {nameError}
          </KoolaText>
        ) : null}

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
          placeholder="Ít nhất 8 ký tự"
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
          title="Tạo tài khoản"
          icon="person-add-alt"
          loading={loading}
          onPress={handleRegister}
          style={styles.primaryButton}
        />

        <Pressable
          style={styles.linkButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 4, bottom: 4 }}
          accessibilityRole="link"
          accessibilityLabel="Đăng nhập tài khoản đã có">
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
      gap: 8,
      marginBottom: 22,
      paddingHorizontal: 8,
    },
    logo: {
      marginBottom: 6,
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
    fieldError: {
      color: p.danger,
      marginTop: -8,
      marginLeft: 4,
    },
  });

export default RegisterScreen;
