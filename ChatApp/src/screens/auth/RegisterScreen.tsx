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

  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

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

  const focusFirstInvalid = () => {
    if (!displayName.trim()) {
      nameRef.current?.focus();
    } else if (!email.trim()) {
      emailRef.current?.focus();
    } else if (!password.trim() || password.length < 8) {
      passwordRef.current?.focus();
    }
  };

  const announceErrors = () => {
    const errors: string[] = [];
    if (!displayName.trim()) errors.push('Vui lòng nhập tên hiển thị');
    if (!email.trim()) errors.push('Vui lòng nhập email');
    if (!password.trim()) {
      errors.push('Vui lòng nhập mật khẩu');
    } else if (password.length < 8) {
      errors.push('Mật khẩu phải có ít nhất 8 ký tự');
    }
    if (errors.length > 0) {
      AccessibilityInfo.announceForAccessibility(errors.join('. '));
    }
  };

  const handleRegister = async () => {
    if (!validate()) {
      focusFirstInvalid();
      announceErrors();
      return;
    }
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
        : msg || 'Da xay ra loi';
      if (text.toLowerCase().includes('email')) {
        setEmailError(text);
        emailRef.current?.focus();
      } else {
        Alert.alert('Đăng ký thất bại', text);
      }
      AccessibilityInfo.announceForAccessibility(text);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFormShell>
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
          ref={nameRef}
          label="Tên hiển thị"
          icon="person-outline"
          placeholder="Nguyễn Văn A"
          value={displayName}
          onChangeText={(t) => { setDisplayName(t); setNameError(''); }}
          autoCapitalize="words"
          error={nameError}
          accessibilityLabel="Ten hien thi"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          blurOnSubmit={false}
        />

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
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
        />

        <KoolaTextInput
          ref={passwordRef}
          label="Mật khẩu"
          icon="lock-outline"
          placeholder="Ít nhất 8 ký tự"
          value={password}
          onChangeText={(t) => { setPassword(t); setPasswordError(''); }}
          secureTextEntry
          error={passwordError}
          accessibilityLabel="Mat khau"
          returnKeyType="go"
          onSubmitEditing={handleRegister}
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
          hitSlop={{ top: 4, bottom: 4 }}
          accessibilityRole="link"
          accessibilityLabel="Dang nhap tai khoan da co">
          <KoolaText tone="muted" align="center">
            Da co tai khoan?{' '}
            <KoolaText tone="primary" weight="800">
              Dang nhap
            </KoolaText>
          </KoolaText>
        </Pressable>
      </KoolaSurface>
    </AuthFormShell>
  );
};

// --- Styles ---

const makeStyles = (_p: Palette) =>
  StyleSheet.create({
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
  });

export default RegisterScreen;
