import React, { useState, useEffect } from 'react';
import { Alert, View, StyleSheet } from 'react-native';
import { useAuth } from '../../../../contexts/AuthContext';
import { usersApi } from '../../../../services/api/apiService';
import { KoolaButton, KoolaTextInput, KoolaText } from '../../../../ui';
import { EditProfileSheet } from './EditProfileSheet';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const PHONE_REGEX = /^\+84\d{9,10}$/;

export const PhoneSheet: React.FC<Props> = ({ visible, onClose }) => {
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setStep(1);
      setPhone(user?.phone || '');
      setCode('');
      setError('');
    }
  }, [visible, user?.phone]);

  const phoneValid = PHONE_REGEX.test(phone);
  const phoneChanged = phone !== (user?.phone || '');

  const handleSendOtp = async () => {
    if (!phoneValid) return;
    setSending(true);
    setError('');
    try {
      await usersApi.requestPhoneOtp(phone);
      setStep(2);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      const status = e.response?.status;
      const msg = e.response?.data?.message;
      if (status === 409) setError(msg || 'Số điện thoại đã được sử dụng');
      else if (status === 429) setError(msg || 'Vui lòng đợi trước khi gửi lại');
      else if (status === 400) setError(msg || 'Số điện thoại không hợp lệ');
      else if (status === 503) setError(msg || 'Không thể gửi mã xác thực. Vui lòng thử lại.');
      else setError('Đã có lỗi xảy ra');
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setVerifying(true);
    setError('');
    try {
      await usersApi.verifyPhoneOtp(phone, code);
      await refreshUser();
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      const status = e.response?.status;
      const msg = e.response?.data?.message;
      if (status === 400) setError(msg || 'Mã xác thực không đúng');
      else if (status === 429) setError(msg || 'Vượt quá số lần thử. Vui lòng yêu cầu mã mới.');
      else if (status === 410) setError(msg || 'Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới.');
      else if (status === 404) setError(msg || 'Không có yêu cầu thay đổi đang chờ');
      else setError('Đã có lỗi xảy ra');
    } finally {
      setVerifying(false);
    }
  };

  const handleRemovePhone = () => {
    Alert.alert(
      'Gỡ số điện thoại',
      'Bạn có chắc muốn gỡ số điện thoại khỏi tài khoản?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Gỡ',
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            try {
              await usersApi.removePhone();
              await refreshUser();
              onClose();
            } catch (err: unknown) {
              const error = err as { response?: { data?: { message?: string } } };
              Alert.alert('Lỗi', error.response?.data?.message || 'Không thể gỡ số điện thoại');
            } finally {
              setRemoving(false);
            }
          },
        },
      ],
    );
  };

  return (
    <EditProfileSheet
      visible={visible}
      onClose={onClose}
      title="Số điện thoại"
      dirty={step === 2 || (step === 1 && phoneChanged)}>
      {step === 1 ? (
        <View style={styles.content}>
          <KoolaTextInput
            value={phone}
            onChangeText={(t) => { setPhone(t); setError(''); }}
            placeholder="+84901234567"
            keyboardType="phone-pad"
            autoFocus
          />
          {error ? (
            <KoolaText variant="caption" tone="danger" style={styles.errorText}>
              {error}
            </KoolaText>
          ) : null}
          <KoolaButton
            title="Gửi mã"
            onPress={handleSendOtp}
            loading={sending}
            disabled={!phoneValid || !phoneChanged || sending}
            style={styles.actionBtn}
          />
          {user?.phone ? (
            <KoolaButton
              title="Gỡ số điện thoại"
              variant="ghost"
              onPress={handleRemovePhone}
              loading={removing}
              disabled={removing}
              style={styles.removeBtn}
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.content}>
          <KoolaText variant="body" tone="muted" style={styles.hint}>
            Nhập mã 6 chữ số đã gửi đến {phone}
          </KoolaText>
          <KoolaTextInput
            value={code}
            onChangeText={(t) => { setCode(t.replace(/\D/g, '').slice(0, 6)); setError(''); }}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          {error ? (
            <KoolaText variant="caption" tone="danger" style={styles.errorText}>
              {error}
            </KoolaText>
          ) : null}
          <KoolaButton
            title="Xác thực"
            onPress={handleVerify}
            loading={verifying}
            disabled={code.length !== 6 || verifying}
            style={styles.actionBtn}
          />
        </View>
      )}
    </EditProfileSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  hint: {
    marginBottom: 4,
  },
  errorText: {
    marginTop: -4,
  },
  actionBtn: {
    marginTop: 8,
  },
  removeBtn: {
    marginTop: 12,
  },
});
