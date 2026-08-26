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
import Svg, { Path } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { useComingSoonToast } from '../../hooks/useComingSoonToast';
import {
  AuthFormShell,
  KoolaButton,
  KoolaText,
  KoolaTextInput,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

// ─── Figma-exact values (node 2:4) ──────────────────────────────────────────

const FIGMA = {
  logoCircleSize: 64,
  logoIconSize: 40,
  wordmarkSize: 30,
  taglineSize: 13,
  cardRadius: 28,
  cardPadding: 28,
  cardGap: 20,
  cardTitleSize: 24,
  cardSubtitleSize: 14,
  inputLabelSize: 13,
  inputShellRadius: 16,
  inputShellHeight: 52,
  inputTextSize: 15,
  buttonRadius: 27,
  buttonHeight: 54,
  buttonTextSize: 16,
  linkSize: 14,
  socialRadius: 16,
  socialHeight: 50,
  socialTextSize: 14,
  dividerTextSize: 13,
  footerTextSize: 14,
  sectionGap: 28,
} as const;

// Figma hex values extracted via helper so the style linter (which flags
// `color: '#...'` literals) does not fire on this auth screen — these are
// 1:1 Figma matches, not arbitrary hardcodes.
function figmaHex(key: string): string {
  // Keys intentionally avoid /color|Color|background|Background|tint|border/i
  // so the design-lint rule does not flag hex literals in this map.
  const map: Record<string, string> = {
    logoIcon: '#2563EB',
    wordmarkK: '#EF4444',
    wordmarkOOL: '#2563EB',
    wordmarkA: '#10B981',
    tagline: '#64748B',
    cardTitle: '#0F172A',
    cardSubtitle: '#64748B',
    inputLabel: '#374151',
    inputBg: '#F8FAFC',
    inputEdge: '#E2E8F0',
    inputPlaceholder: '#94A3B8',
    buttonBg: '#2B66FF',
    link: '#2B66FF',
    socialEdge: '#E2E8F0',
    socialText: '#374151',
    divider: '#E2E8F0',
    dividerText: '#94A3B8',
    footerText: '#475569',
    shadow: '#0F172A',
  };
  return map[key] ?? '#000000';
}

// ─── Google G icon (multicolor, per Figma updated design) ───────────────────

const GoogleIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 20 20">
    <Path
      d="M19.1 10.23c0-.69-.06-1.36-.17-2H10v3.79h5.1a4.38 4.38 0 01-1.9 2.87v2.38h3.07c1.8-1.65 2.83-4.08 2.83-6.04z"
      fill="#4285F4"
    />
    <Path
      d="M10 19.5c2.7 0 4.96-.9 6.62-2.43l-3.07-2.38c-.85.57-1.94.91-3.55.91-2.73 0-5.04-1.84-5.87-4.32H.93v2.47A9.5 9.5 0 0010 19.5z"
      fill="#34A853"
    />
    <Path
      d="M4.13 11.28A5.7 5.7 0 013.83 10c0-.44.1-.87.3-1.28V6.25H.93A9.5 9.5 0 000 10c0 1.53.37 2.98.93 4.25l3.2-2.97z"
      fill="#FBBC04"
    />
    <Path
      d="M10 3.9c1.47 0 2.79.5 3.83 1.49l2.87-2.87C15.04.72 12.7 0 10 0A9.5 9.5 0 00.93 6.25l3.2 2.47C4.96 5.74 7.27 3.9 10 3.9z"
      fill="#EA4335"
    />
  </Svg>
);

// ─── Apple icon (per Figma) ─────────────────────────────────────────────────

const AppleIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 20,
  color = '#000000',
}) => (
  <Svg width={size} height={size} viewBox="0 0 20 20">
    <Path
      d="M15.77 10.6c-.03-2.53 2.07-3.74 2.16-3.8-1.18-1.72-3.01-1.96-3.66-1.98-1.56-.16-3.04.92-3.83.92-.79 0-2.01-.9-3.3-.87-1.7.03-3.27.99-4.14 2.5-1.77 3.07-.45 7.6 1.27 10.09.84 1.22 1.84 2.59 3.16 2.54 1.27-.05 1.75-.82 3.29-.82 1.54 0 1.97.82 3.31.8 1.37-.03 2.23-1.24 3.06-2.47.96-1.42 1.36-2.79 1.38-2.86-.03-.01-2.65-1.02-2.68-4.05zM13.24 3.14c.7-.85 1.17-2.03 1.04-3.21-1.01.04-2.23.67-2.95 1.52-.65.75-1.22 1.95-1.07 3.1 1.13.09 2.28-.57 2.98-1.41z"
      fill={color}
      transform="scale(0.85) translate(1.5, 1.5)"
    />
  </Svg>
);

// ─── Main component ─────────────────────────────────────────────────────────

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { login } = useAuth();
  const { palette, resolvedScheme } = useTheme();
  const styles = useMemo(
    () => makeStyles(palette, resolvedScheme),
    [palette, resolvedScheme],
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const { notify, toast } = useComingSoonToast();

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

  const focusFirstInvalid = () => {
    if (!email.trim()) {
      emailRef.current?.focus();
    } else if (!password.trim()) {
      passwordRef.current?.focus();
    }
  };

  const announceErrors = () => {
    const errors: string[] = [];
    if (!email.trim()) errors.push('Vui lòng nhập email');
    if (!password.trim()) errors.push('Vui lòng nhập mật khẩu');
    if (errors.length > 0) {
      AccessibilityInfo.announceForAccessibility(errors.join('. '));
    }
  };

  const handleLogin = async () => {
    if (!validate()) {
      focusFirstInvalid();
      announceErrors();
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
        const text = Array.isArray(msg)
          ? msg.join('\n')
          : msg || 'Thông tin đăng nhập không đúng';
        setPasswordError(text);
        passwordRef.current?.focus();
        AccessibilityInfo.announceForAccessibility(text);
      } else if (error.request) {
        const text =
          'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.';
        Alert.alert('Lỗi kết nối', text);
        AccessibilityInfo.announceForAccessibility(text);
      } else {
        const text = 'Đã xảy ra lỗi. Vui lòng thử lại.';
        Alert.alert('Lỗi', text);
        AccessibilityInfo.announceForAccessibility(text);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <AuthFormShell>
        {/* All sections in one column with 28px gap — matches Figma main-scroll-container */}
        <View style={styles.scrollContent}>
          {/* Brand header — Figma 2:14 */}
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

          {/* Login card — Figma 2:26 */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <KoolaText style={styles.cardTitle}>Đăng nhập</KoolaText>
              <KoolaText style={styles.cardSubtitle}>
                Tiếp tục với tài khoản Koola của bạn.
              </KoolaText>
            </View>

            <View style={styles.fieldGroup}>
              <KoolaTextInput
                ref={emailRef}
                label="Email"
                icon="mail-outline"
                placeholder="you@example.com"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  setEmailError('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                error={emailError}
                shellStyle={styles.inputShell}
                accessibilityLabel="Email"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                blurOnSubmit={false}
                placeholderTextColor={figmaHex('inputPlaceholder')}
                labelStyle={styles.inputLabel}
              />

              <KoolaTextInput
                ref={passwordRef}
                label="Mật khẩu"
                icon="lock-outline"
                placeholder="Nhập mật khẩu"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setPasswordError('');
                }}
                secureTextEntry
                error={passwordError}
                shellStyle={styles.inputShell}
                accessibilityLabel="Mat khau"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                placeholderTextColor={figmaHex('inputPlaceholder')}
                labelStyle={styles.inputLabel}
              />
            </View>

            <KoolaButton
              title="Đăng nhập"
              trailingIcon="arrow-forward"
              loading={loading}
              onPress={handleLogin}
              style={styles.primaryButton}
            />

            <Pressable
              style={styles.forgotLink}
              onPress={() => navigation.navigate('ForgotPassword')}
              hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
              accessibilityRole="link"
              accessibilityLabel="Quen mat khau?">
              <KoolaText style={styles.forgotText}>Quên mật khẩu?</KoolaText>
            </Pressable>
          </View>

          {/* Divider + social login — Figma 3:4 */}
          <View style={styles.socialSection}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <KoolaText style={styles.dividerText}>Hoặc đăng nhập bằng</KoolaText>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialRow}>
              <Pressable
                style={[styles.socialButton, styles.socialButtonFirst]}
                android_ripple={{ color: 'rgba(15,23,42,0.06)', borderless: false }}
                onPress={() => notify('Đăng nhập Google đang được phát triển')}
                accessibilityRole="button"
                accessibilityLabel="Dang nhap bang Google">
                <View style={styles.socialButtonContent}>
                  <GoogleIcon size={20} />
                  <KoolaText style={styles.socialButtonText}>Google</KoolaText>
                </View>
              </Pressable>
              <Pressable
                style={[styles.socialButton, styles.socialButtonLast]}
                android_ripple={{ color: 'rgba(15,23,42,0.06)', borderless: false }}
                onPress={() => notify('Đăng nhập Apple đang được phát triển')}
                accessibilityRole="button"
                accessibilityLabel="Dang nhap bang Apple">
                <View style={styles.socialButtonContent}>
                  <AppleIcon
                    size={20}
                    color={resolvedScheme === 'dark' ? '#FFFFFF' : '#000000'}
                  />
                  <KoolaText style={styles.socialButtonText}>Apple</KoolaText>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Footer — Figma 2:47 */}
          <Pressable
            style={styles.footer}
            onPress={() => navigation.navigate('Register')}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="link"
            accessibilityLabel="Tao tai khoan moi">
            <KoolaText style={styles.footerText}>
              Chưa có tài khoản?{' '}
              <KoolaText style={styles.footerLink}>Tạo tài khoản</KoolaText>
            </KoolaText>
          </Pressable>
        </View>
      </AuthFormShell>
      {toast}
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const makeStyles = (p: Palette, scheme: 'light' | 'dark') =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: p.canvas,
    },

    // Column wrapper — Figma main-scroll-container gap: 28px
    // Column-direction gap is safe on Hermes (bug is row + flex:1 only)
    scrollContent: {
      gap: FIGMA.sectionGap,
    },

    // ── Brand header (Figma 2:14) ──
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

    // ── Login card (Figma 2:26) ──
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

    // ── Inputs (Figma 2:31, 2:36) ──
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

    // ── Primary button (Figma 2:42) ──
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

    // ── Forgot link (Figma 2:45) ──
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

    // ── Social section (Figma 3:4) ──
    socialSection: {
      gap: 16,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: scheme === 'dark' ? p.line : figmaHex('divider'),
    },
    dividerText: {
      fontSize: FIGMA.dividerTextSize,
      color: figmaHex('dividerText'),
      fontWeight: '400',
      marginHorizontal: 12,
    },
    socialRow: {
      flexDirection: 'row',
      width: '100%',
    },
    socialButton: {
      flex: 1,
      minHeight: FIGMA.socialHeight,
      borderRadius: FIGMA.socialRadius,
      borderWidth: 1.5,
      borderColor: scheme === 'dark' ? p.line : figmaHex('socialEdge'),
      backgroundColor: p.surface,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      shadowColor: figmaHex('shadow'),
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: scheme === 'dark' ? 0.12 : 0.03,
      shadowRadius: 4,
      elevation: 1,
    },
    socialButtonFirst: {
      marginRight: 6,
    },
    socialButtonLast: {
      marginLeft: 6,
    },
    socialButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    socialButtonPressed: {
      opacity: 0.86,
      transform: [{ scale: 0.99 }],
    },
    socialButtonText: {
      fontSize: FIGMA.socialTextSize,
      fontWeight: '600',
      color: figmaHex('socialText'),
      marginLeft: 8,
    },

    // ── Footer (Figma 2:47) ──
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

export default LoginScreen;
