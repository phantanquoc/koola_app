import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../services/api/apiService';
import {
  AuthFormShell,
  KoolaButton,
  KoolaOtpInput,
  KoolaText,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';
import { FIGMA, figmaHex } from './authFigma';

type Props = NativeStackScreenProps<RootStackParamList, 'OtpVerify'>;

const OTP_EXPIRY = 300;
const RESEND_COOLDOWN = 45;
const MAX_ATTEMPTS = 5;

const OtpVerifyScreen: React.FC<Props> = ({ route, navigation }) => {
  const { email } = route.params;
  const { verifyOtp } = useAuth();
  const { palette, resolvedScheme } = useTheme();
  const styles = useMemo(() => makeStyles(palette, resolvedScheme), [palette, resolvedScheme]);

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(OTP_EXPIRY);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [attempts, setAttempts] = useState(0);
  const [otpError, setOtpError] = useState('');

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Separate resend cooldown timer (shorter than expiry)
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleVerify = useCallback(async () => {
    setOtpError('');
    if (otp.length !== 6) {
      const errMsg = 'Vui long nhap du 6 so';
      setOtpError(errMsg);
      AccessibilityInfo.announceForAccessibility(errMsg);
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      const errMsg = 'Qua so lan thu. Vui long gui lai ma moi.';
      setOtpError(errMsg);
      AccessibilityInfo.announceForAccessibility(errMsg);
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(email, otp);
      // Auto-login: verifyOtp sets tokens + user in AuthContext,
      // RootNavigator swaps to the authenticated group automatically.
    } catch (err: unknown) {
      setAttempts((prev) => prev + 1);
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
      const msg = error.response?.data?.message;
      const text = Array.isArray(msg)
        ? msg.join('\n')
        : msg || 'Ma xac thuc khong dung';
      setOtpError(text);
      AccessibilityInfo.announceForAccessibility(text);
    } finally {
      setLoading(false);
    }
  }, [otp, email, verifyOtp, attempts]);

  const handleResend = useCallback(async () => {
    setResending(true);
    try {
      await authApi.resendOtp(email);
      setOtp('');
      setOtpError('');
      setAttempts(0);
      setCountdown(OTP_EXPIRY);
      setResendCooldown(RESEND_COOLDOWN);
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
      const msg = error.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join('\n') : msg || 'Khong the gui lai ma';
      Alert.alert('Gui lai that bai', text);
      AccessibilityInfo.announceForAccessibility(text);
    } finally {
      setResending(false);
    }
  }, [email]);

  const resendDisabled = resending || resendCooldown > 0;

  return (
    <View style={styles.root}>
      <AuthFormShell>
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
              <KoolaText style={styles.cardTitle}>Xác thực OTP</KoolaText>
              <KoolaText style={styles.cardSubtitle}>
                Nhập mã 6 số đã gửi đến {email}
              </KoolaText>
            </View>

            <KoolaOtpInput
              value={otp}
              onChange={(v) => { setOtp(v); setOtpError(''); }}
              autoFocus
              error={otpError}
            />

            <KoolaText
              align="center"
              tone={countdown > 0 ? 'muted' : 'danger'}
              weight="700">
              {countdown > 0
                ? `Mã hết hạn sau: ${formatTime(countdown)}`
                : 'Mã đã hết hạn'}
            </KoolaText>

            {attempts > 0 && attempts < MAX_ATTEMPTS ? (
              <KoolaText
                align="center"
                style={styles.warningText}
                weight="700">
                Còn {MAX_ATTEMPTS - attempts} lần thử
              </KoolaText>
            ) : null}

            <KoolaButton
              title="Xác thực"
              trailingIcon="arrow-forward"
              loading={loading}
              onPress={handleVerify}
              disabled={loading || countdown <= 0}
              style={styles.primaryButton}
            />

            <Pressable
              style={styles.resendButton}
              onPress={handleResend}
              disabled={resendDisabled}
              hitSlop={{ top: 4, bottom: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Gui lai ma xac thuc"
              accessibilityState={{ disabled: resendDisabled }}>
              <KoolaText
                tone={resendDisabled ? 'faint' : 'primary'}
                weight="800"
                align="center">
                {resending
                  ? 'Dang gui lai...'
                  : resendCooldown > 0
                    ? `Gui lai ma (${resendCooldown}s)`
                    : 'Gui lai ma'}
              </KoolaText>
            </Pressable>
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
    warningText: {
      color: p.warning,
    },
    resendButton: {
      paddingVertical: 8,
    },
  });

export default OtpVerifyScreen;
