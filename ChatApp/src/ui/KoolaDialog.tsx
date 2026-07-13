import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { KoolaText } from './KoolaText';
import { KoolaButton } from './KoolaButton';
import { useTheme } from './ThemeProvider';
import { koolaRadii, koolaSpacing } from './theme';
import type { SemanticTokens } from './tokens/semantic';

export interface KoolaDialogAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

export interface KoolaDialogProps {
  visible: boolean;
  title: string;
  body?: string;
  actions?: KoolaDialogAction[];
  onDismiss?: () => void;
  children?: React.ReactNode;
}

export const KoolaDialog: React.FC<KoolaDialogProps> = ({
  visible,
  title,
  body,
  actions = [],
  onDismiss,
  children,
}) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      accessibilityViewIsModal>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Đóng hộp thoại"
        />
        <View
          style={styles.dialog}
          accessibilityRole="alert">
          <KoolaText variant="heading" numberOfLines={2}>
            {title}
          </KoolaText>
          {body ? (
            <KoolaText variant="body" tone="muted" style={styles.body}>
              {body}
            </KoolaText>
          ) : null}
          {children}
          {actions.length > 0 && (
            <View style={styles.actions}>
              {actions.map((action, idx) => (
                <KoolaButton
                  key={idx}
                  title={action.label}
                  variant={action.variant || 'primary'}
                  onPress={action.onPress}
                  style={styles.actionBtn}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

function makeStyles(semantic: SemanticTokens) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: semantic.surface.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: koolaSpacing.xl,
    },
    dialog: {
      width: '100%',
      maxWidth: 320,
      backgroundColor: semantic.surface.level1,
      borderRadius: koolaRadii.lg,
      padding: koolaSpacing.xl,
    },
    body: {
      marginTop: koolaSpacing.sm,
    },
    actions: {
      marginTop: koolaSpacing.lg,
    },
    actionBtn: {
      marginTop: koolaSpacing.sm,
      width: '100%',
    },
  });
}
