import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import { koolaRadii, koolaSpacing, koolaOpacity } from './theme';
import type { SemanticTokens } from './tokens/semantic';

export interface KoolaMenuItem {
  key: string;
  label: string;
  icon?: string;
  selected?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
}

export interface KoolaMenuProps {
  visible: boolean;
  items: KoolaMenuItem[];
  onDismiss: () => void;
}

export const KoolaMenu: React.FC<KoolaMenuProps> = ({
  visible,
  items,
  onDismiss,
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
          accessibilityLabel="Đóng menu"
        />
        <View
          style={styles.menu}
          accessibilityRole="menu">
          {items.map((item) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [
                styles.menuItem,
                item.selected && styles.menuItemSelected,
                item.disabled && styles.menuItemDisabled,
                pressed && !item.disabled && styles.menuItemPressed,
              ]}
              onPress={() => {
                if (!item.disabled) {
                  item.onPress();
                  onDismiss();
                }
              }}
              disabled={item.disabled}
              accessibilityRole="menuitem"
              accessibilityState={{
                selected: item.selected,
                disabled: item.disabled,
              }}
              accessibilityLabel={item.label}>
              {item.icon && (
                <MaterialIcons
                  name={item.icon}
                  size={20}
                  color={
                    item.destructive
                      ? tokens.semantic.status.danger
                      : item.disabled
                        ? tokens.semantic.text.faint
                        : tokens.semantic.text.primary
                  }
                  style={styles.menuIcon}
                />
              )}
              <KoolaText
                variant="label"
                tone={item.destructive ? 'danger' : item.disabled ? 'faint' : 'ink'}
                style={styles.menuLabel}
                numberOfLines={2}>
                {item.label}
              </KoolaText>
              {item.selected && (
                <MaterialIcons
                  name="check"
                  size={18}
                  color={tokens.semantic.action.primary}
                />
              )}
            </Pressable>
          ))}
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
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    menu: {
      width: '100%',
      maxWidth: 560,
      backgroundColor: semantic.surface.level1,
      borderTopLeftRadius: koolaRadii.xl,
      borderTopRightRadius: koolaRadii.xl,
      paddingTop: koolaSpacing.sm,
      paddingBottom: koolaSpacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: semantic.border.subtle,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      paddingHorizontal: koolaSpacing.lg,
      paddingVertical: koolaSpacing.md,
    },
    menuItemSelected: {
      backgroundColor: semantic.action.primarySoft,
    },
    menuItemDisabled: {
      opacity: koolaOpacity.disabled,
    },
    menuItemPressed: {
      opacity: koolaOpacity.pressed,
    },
    menuIcon: {
      marginRight: koolaSpacing.md,
    },
    menuLabel: {
      flex: 1,
    },
  });
}
