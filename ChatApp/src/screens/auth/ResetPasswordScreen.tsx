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
  KoolaOtpInput,
  KoolaText,
  KoolaTextInput,
  useTheme,
} from '../../ui';
import type { Palette } from '../../ui/theme';
import { FIGMA, figmaHex } from './authFigma';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

type Step = 'otp' | 'newPassword';

const ResetPasswordScreen: React.FC<Props> = ({ route, navigation }) => {
  const { email } = route.params;
  const { verifyResetOtp, resetPassword } = useAuth();
  const { palette, resolvedScheme } = useTheme();
  const styles = useMemo(() => makeStyles(palette, resolvedScheme), [palette, resolvedScheme]);

  const [step, setStep] = useState<Step>('otp');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const handleVerifyOtp = async () => {
    setOtpError('');
    if (otp.length !== 6) {
      const errMsg = 'Vui long nhap du ma 6 so';
      setOtpError(errMsg);
      AccessibilityInfo.announceForAccessibility(errMsg);
      return;
    }
    setLoading(true);
    try {
      const result = await verifyResetOtp(email, otp);
      setResetToken(result.resetToken);
      setStep('newPassword');
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
      const msg = error.response?.data?.message;
      const text = Array.isArray(msg)
        ? msg.join('\n')
        : msg || 'Mã xác thực không đúng';
      setOtpError(text);
      AccessibilityInfo.announceForAccessibility(text);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setPasswordError('');
    setConfirmError('');
    let valid = true;
    const errors: string[] = [];
    if (newPassword.length < 8) {
      const errMsg = 'Mật khẩu phải có ít nhất 8 ký tự';
      setPasswordError(errMsg);
      errors.push(errMsg);
      valid = false;
    }
    if (newPassword !== confirmPassword) {
      const errMsg = 'Mật khẩu xác nhận không khớp';
      setConfirmError(errMsg);
      errors.push(errMsg);
      valid = false;
    }
    if (!valid) {
      // Focus first invalid
      if (newPassword.length < 8) {
        passwordRef.current?.focus();
      } else {
        confirmRef.current?.focus();
      }
      AccessibilityInfo.announceForAccessibility(errors.join('. '));
      return;
    }
    setLoading(true);
    try {
      await resetPassword(resetToken, newPassword);
      Alert.alert(
        'Thành công',
        'Mật khẩu đã được đặt lại. Vui lòng đăng nhập lại.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }],
      );
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string | string[] } };
      };
      const msg = error.response?.data?.message;
      const text = Array.isArray(msg)
        ? msg.join('\n')
        : msg || 'Đã xảy ra lỗi';
      Alert.alert('Lỗi', text);
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
              <KoolaText style={styles.cardTitle}>
                {step === 'otp' ? 'Nhập mã xác thực' : 'Đặt mật khẩu mới'}
              </KoolaText>
              <KoolaText style={styles.cardSubtitle}>
                {step === 'otp'
                  ? `Nhập mã 6 số đã gửi đến ${email}`
                  : 'Nhập mật khẩu mới (ít nhất 8 ký tự)'}
              </KoolaText>
            </View>

            {step === 'otp' ? (
              <>
                <KoolaOtpInput
                  value={otp}
                  onChange={(v) => { setOtp(v); setOtpError(''); }}
                  autoFocus
                  error={otpError}
                />

                <KoolaButton
                  title="Xác thực"
                  trailingIcon="arrow-forward"
                  loading={loading}
                  onPress={handleVerifyOtp}
                  style={styles.primaryButton}
                />
              </>
            ) : (
              <>
                <View style={styles.fieldGroup}>
                  <KoolaTextInput
                    ref={passwordRef}
                    label="Mật khẩu mới"
                    icon="lock-outline"
                    placeholder="Ít nhất 8 ký tự"
                    value={newPassword}
                    onChangeText={(t) => { setNewPassword(t); setPasswordError(''); }}
                    secureTextEntry
                    error={passwordError}
                    shellStyle={styles.inputShell}
                    labelStyle={styles.inputLabel}
                    placeholderTextColor={figmaHex('inputPlaceholder')}
                    accessibilityLabel="Mat khau moi"
                    returnKeyType="next"
                    onSubmitEditing={() => confirmRef.current?.focus()}
                    blurOnSubmit={false}
                  />

                  <KoolaTextInput
                    ref={confirmRef}
                    label="Xác nhận mật khẩu"
                    icon="lock-outline"
                    placeholder="Nhập lại mật khẩu"
                    value={confirmPassword}
                    onChangeText={(t) => { setConfirmPassword(t); setConfirmError(''); }}
                    secureTextEntry
                    error={confirmError}
                    shellStyle={styles.inputShell}
                    labelStyle={styles.inputLabel}
                    placeholderTextColor={figmaHex('inputPlaceholder')}
                    accessibilityLabel="Xac nhan mat khau"
                    returnKeyType="go"
                    onSubmitEditing={handleResetPassword}
                  />
                </View>

                <KoolaButton
                  title="Đặt lại mật khẩu"
                  trailingIcon="arrow-forward"
                  loading={loading}
                  onPress={handleResetPassword}
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

export default ResetPasswordScreen;
