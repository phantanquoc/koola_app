import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, koolaColors, koolaRadii, koolaSpacing } from '../ui';

interface AttachmentSheetProps {
  visible: boolean;
  onClose: () => void;
  onPickImage: () => void;
  onPickVideo: () => void;
  onPickDocument: () => void;
}

interface Option {
  key: string;
  icon: string;
  label: string;
  tint: string;
  tintSoft: string;
  onPress: (props: AttachmentSheetProps) => void;
}

const OPTIONS: Option[] = [
  {
    key: 'image',
    icon: 'image',
    label: 'Ảnh',
    tint: koolaColors.primary,
    tintSoft: koolaColors.primarySoft,
    onPress: (p) => p.onPickImage(),
  },
  {
    key: 'video',
    icon: 'videocam',
    label: 'Video',
    tint: koolaColors.warm,
    tintSoft: koolaColors.warningSoft,
    onPress: (p) => p.onPickVideo(),
  },
  {
    key: 'document',
    icon: 'insert-drive-file',
    label: 'Tài liệu',
    tint: koolaColors.accent,
    tintSoft: koolaColors.accentSoft,
    onPress: (p) => p.onPickDocument(),
  },
];

/**
 * Bottom sheet for choosing an attachment type. Replaces the old
 * `Alert.alert` picker with a tokenized, tappable surface.
 */
const AttachmentSheet: React.FC<AttachmentSheetProps> = (props) => {
  const { visible, onClose } = props;
  const bottomInset = initialWindowMetrics?.insets.bottom ?? 0;

  // Fabric-safe: do not mount native <Modal> (Dialog Window) until visible.
  // Eager mount with visible=false races RN's removeViewAt on Android Fabric.
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose} accessible={false}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, { paddingBottom: koolaSpacing.lg + bottomInset }]}>
        <View style={styles.handle} />
        <KoolaText variant="label" tone="ink" weight="700" style={styles.title}>
          Gửi tệp đính kèm
        </KoolaText>
        <View style={styles.optionsRow}>
          {OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              onPress={() => {
                onClose();
                // Defer the picker so the modal dismiss animation can settle
                // before a native picker takes over the screen.
                setTimeout(() => opt.onPress(props), 180);
              }}
              style={({ pressed }) => [styles.option, pressed ? styles.optionPressed : null]}>
              <View style={[styles.iconShell, { backgroundColor: opt.tintSoft }]}>
                <MaterialIcons name={opt.icon} size={26} color={opt.tint} />
              </View>
              <KoolaText variant="caption" tone="muted" weight="600" style={styles.optionLabel}>
                {opt.label}
              </KoolaText>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 24, 40, 0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: koolaColors.surface,
    borderTopLeftRadius: koolaRadii.lg,
    borderTopRightRadius: koolaRadii.lg,
    paddingHorizontal: koolaSpacing.xl,
    paddingTop: koolaSpacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: koolaRadii.pill,
    backgroundColor: koolaColors.line,
    marginBottom: koolaSpacing.md,
  },
  title: {
    marginBottom: koolaSpacing.lg,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  option: {
    alignItems: 'center',
    gap: koolaSpacing.sm,
  },
  optionPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  iconShell: {
    width: 58,
    height: 58,
    borderRadius: koolaRadii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    marginTop: 2,
  },
});

export default AttachmentSheet;
