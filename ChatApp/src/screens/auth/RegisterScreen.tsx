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

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { registerInit } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email.trim() || !password.trim() || !displayName.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
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
          Tao tai khoan
        </KoolaText>
        <KoolaText variant="body" tone="muted" align="center">
          Bat dau tro chuyen va ket noi voi cong dong Koola.
        </KoolaText>
      </View>

      <KoolaSurface variant="raised" style={styles.form}>
        <KoolaTextInput
          label="Ten hien thi"
          icon="person-outline"
          placeholder="Nguyen Van A"
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
          label="Mat khau"
          icon="lock-outline"
          placeholder="It nhat 8 ky tu"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <KoolaButton
          title="Tao tai khoan"
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
            Da co tai khoan?{' '}
            <KoolaText tone="primary" weight="800">
              Dang nhap
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
