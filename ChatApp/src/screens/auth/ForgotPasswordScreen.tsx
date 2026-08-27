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

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

const ForgotPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const { forgotPassword } = useAuth();
  const { palette, resolvedScheme } = useTheme();
  const styles = useMemo(() => makeStyles(palette, resolvedScheme), [palette, resolvedScheme]);

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
              <KoolaText style={styles.cardTitle}>Quên mật khẩu</KoolaText>
              <KoolaText style={styles.cardSubtitle}>
                Nhập email để nhận mã xác thực đặt lại mật khẩu.
              </KoolaText>
            </View>

            {!sent ? (
              <>
                <View style={styles.fieldGroup}>
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
                    returnKeyType="go"
                    onSubmitEditing={handleSubmit}
                  />
                </View>

                <KoolaButton
                  title="Gửi mã xác thực"
                  trailingIcon="arrow-forward"
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
                  title="Nhập mã xác thực"
                  trailingIcon="arrow-forward"
                  onPress={handleContinue}
                  style={styles.primaryButton}
                />
              </>
            )}
          </View>

          <Pressable
            style={styles.footer}
            onPress={() => navigation.navigate('Login')}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="link"
            accessibilityLabel="Quay lai dang nhap">
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

export default ForgotPasswordScreen;
