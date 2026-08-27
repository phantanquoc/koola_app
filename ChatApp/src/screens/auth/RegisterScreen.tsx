import React, { useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Image,
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
  KoolaText,
  KoolaTextInput,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';
import { FIGMA, figmaHex } from './authFigma';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { registerInit } = useAuth();
  const { palette, resolvedScheme } = useTheme();
  const styles = useMemo(() => makeStyles(palette, resolvedScheme), [palette, resolvedScheme]);

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
    <View style={styles.root}>
      <AuthFormShell background={<View style={StyleSheet.absoluteFill} />}>
        <View style={styles.scrollContent}>
          <View style={styles.hero}>
            <Image
              source={require('../../assets/logo_koola.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Koola"
            />
            <KoolaText style={styles.tagline}>
              A good solution - An effective product
            </KoolaText>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <KoolaText style={styles.cardTitle}>Tạo tài khoản</KoolaText>
              <KoolaText style={styles.cardSubtitle}>
                Bắt đầu trò chuyện và kết nối với cộng đồng Koola.
              </KoolaText>
            </View>

            <View style={styles.fieldGroup}>
              <KoolaTextInput
                ref={nameRef}
                label="Tên hiển thị"
                icon="person-outline"
                placeholder="Nguyễn Văn A"
                value={displayName}
                onChangeText={(t) => { setDisplayName(t); setNameError(''); }}
                autoCapitalize="words"
                error={nameError}
                shellStyle={styles.inputShell}
                labelStyle={styles.inputLabel}
                placeholderTextColor={figmaHex('inputPlaceholder')}
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
                shellStyle={styles.inputShell}
                labelStyle={styles.inputLabel}
                placeholderTextColor={figmaHex('inputPlaceholder')}
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
                shellStyle={styles.inputShell}
                labelStyle={styles.inputLabel}
                placeholderTextColor={figmaHex('inputPlaceholder')}
                accessibilityLabel="Mat khau"
                returnKeyType="go"
                onSubmitEditing={handleRegister}
              />
            </View>

            <KoolaButton
              title="Tạo tài khoản"
              trailingIcon="arrow-forward"
              loading={loading}
              onPress={handleRegister}
              style={styles.primaryButton}
            />
          </View>

          <Pressable
            style={styles.footer}
            onPress={() => navigation.navigate('Login')}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="link"
            accessibilityLabel="Dang nhap tai khoan da co">
            <KoolaText style={styles.footerText}>
              Đã có tài khoản?{' '}
              <KoolaText style={styles.footerLink}>Đăng nhập</KoolaText>
            </KoolaText>
          </Pressable>
        </View>
      </AuthFormShell>
    </View>
  );
};

const makeStyles = (p: Palette, scheme: 'light' | 'dark') =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: p.canvas,
    },
    scrollContent: {
      gap: FIGMA.sectionGap,
    },
    hero: {
      alignItems: 'center',
      paddingTop: 8,
      paddingBottom: 4,
      gap: 8,
    },
    logo: {
      width: 140,
      height: 97,
      alignSelf: 'center',
    },
    tagline: {
      fontSize: 13,
      color: figmaHex('tagline'),
      fontWeight: '400',
      opacity: 0.9,
      textAlign: 'center' as const,
    },
    card: {
      backgroundColor: p.surface,
      borderRadius: FIGMA.cardRadius,
      padding: FIGMA.cardPadding,
      gap: FIGMA.cardGap,
      shadowColor: figmaHex('shadow'),
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: scheme === 'dark' ? 0.18 : 0.07,
      shadowRadius: 16,
      elevation: 6,
      borderWidth: scheme === 'dark' ? StyleSheet.hairlineWidth : 0,
      borderColor: scheme === 'dark' ? p.line : 'transparent',
    },
    cardHeader: {
      gap: 6,
      alignItems: 'center',
    },
    cardTitle: {
      fontSize: FIGMA.cardTitleSize,
      lineHeight: Math.round(FIGMA.cardTitleSize * 1.2),
      fontWeight: '700',
      color: figmaHex('cardTitle'),
      textAlign: 'center',
    },
    cardSubtitle: {
      fontSize: FIGMA.cardSubtitleSize,
      lineHeight: Math.round(FIGMA.cardSubtitleSize * 1.4),
      fontWeight: '400',
      color: figmaHex('cardSubtitle'),
      textAlign: 'center',
    },
    fieldGroup: {
      gap: 14,
    },
    inputLabel: {
      fontSize: FIGMA.inputLabelSize,
      fontWeight: '600',
      color: figmaHex('inputLabel'),
    },
    inputShell: {
      minHeight: FIGMA.inputShellHeight,
      borderRadius: FIGMA.inputShellRadius,
      borderWidth: 1.5,
      borderColor: scheme === 'dark' ? p.line : figmaHex('inputEdge'),
      backgroundColor: scheme === 'dark' ? p.canvas : figmaHex('inputBg'),
      paddingHorizontal: 16,
    },
    primaryButton: {
      minHeight: FIGMA.buttonHeight,
      borderRadius: FIGMA.buttonRadius,
      backgroundColor: figmaHex('buttonBg'),
      shadowColor: figmaHex('buttonBg'),
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 4,
    },
    forgotLink: {
      alignSelf: 'flex-end',
      paddingTop: 2,
      paddingBottom: 2,
    },
    forgotText: {
      fontSize: FIGMA.linkSize,
      fontWeight: '600',
      color: figmaHex('link'),
    },
    footer: {
      paddingTop: 8,
      paddingBottom: 8,
    },
    footerText: {
      fontSize: FIGMA.footerTextSize,
      color: figmaHex('footerText'),
      fontWeight: '400',
      textAlign: 'center',
    },
    footerLink: {
      fontSize: FIGMA.footerTextSize,
      color: figmaHex('link'),
      fontWeight: '700',
    },
  });

export default RegisterScreen;
