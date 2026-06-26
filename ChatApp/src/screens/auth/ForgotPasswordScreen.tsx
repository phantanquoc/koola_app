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
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import {
  KoolaButton,
  KoolaSurface,
  KoolaText,
  KoolaTextInput,
  koolaColors,
} from '../../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

const ForgotPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
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
      Alert.alert(
        'Error',
        Array.isArray(msg) ? msg.join('\n') : msg || 'Something went wrong',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    navigation.navigate('ResetPassword', { email: email.trim().toLowerCase() });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <KoolaSurface variant="raised" style={styles.form}>
        <View style={styles.header}>
          <KoolaText variant="title" align="center">
            Quen mat khau
          </KoolaText>
          <KoolaText variant="body" tone="muted" align="center">
            Nhap email de nhan ma xac thuc dat lai mat khau.
          </KoolaText>
        </View>

        {!sent ? (
          <>
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

            <KoolaButton
              title="Gui ma xac thuc"
              icon="send"
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
              title="Nhap ma xac thuc"
              icon="arrow-forward"
              onPress={handleContinue}
              style={styles.primaryButton}
            />
          </>
        )}

        <Pressable
          style={styles.linkButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button">
          <KoolaText tone="primary" weight="800" align="center">
            Quay lai dang nhap
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
  form: {
    padding: 20,
    gap: 16,
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  primaryButton: {
    marginTop: 4,
  },
  linkButton: {
    paddingVertical: 8,
  },
});

export default ForgotPasswordScreen;
