import React, { useCallback } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  KoolaButton,
  KoolaText,
  koolaColors,
  koolaRadii,
} from '../../../../ui';

interface EditProfileSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  dirty?: boolean;
  saving?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  onSave?: () => void;
  children: React.ReactNode;
}

export const EditProfileSheet: React.FC<EditProfileSheetProps> = ({
  visible,
  onClose,
  title,
  dirty = false,
  saving = false,
  saveDisabled = false,
  saveLabel = 'Lưu',
  onSave,
  children,
}) => {
  const handleClose = useCallback(() => {
    if (dirty) {
      Alert.alert('Bỏ thay đổi?', 'Bạn có thay đổi chưa lưu.', [
        { text: 'Tiếp tục chỉnh sửa', style: 'cancel' },
        { text: 'Bỏ', style: 'destructive', onPress: onClose },
      ]);
    } else {
      onClose();
    }
  }, [dirty, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Đóng"
            hitSlop={8}>
            <MaterialIcons
              name="close"
              size={24}
              color={koolaColors.ink}
            />
          </Pressable>
          <KoolaText variant="heading" weight="700" numberOfLines={1}>
            {title}
          </KoolaText>
          <View style={styles.headerSpacer} />
        </View>

        {/* Content */}
        <View style={styles.content}>{children}</View>

        {/* Action bar */}
        {onSave ? (
          <View style={styles.actionBar}>
            <KoolaButton
              title={saveLabel}
              onPress={onSave}
              loading={saving}
              disabled={saveDisabled || saving}
            />
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
    gap: 12,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: koolaRadii.xs,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  actionBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: koolaColors.line,
  },
});
