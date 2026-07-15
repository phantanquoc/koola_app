import React, { useState, useCallback } from 'react';
import {
  View,
  Pressable,
  Modal,
  StyleSheet,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { BusinessSort } from '../../types';
import { KoolaText, koolaColors, koolaRadii } from '../../ui';

interface SortMenuProps {
  value: BusinessSort;
  onChange: (value: BusinessSort) => void;
}

const SORT_OPTIONS: { value: BusinessSort; label: string; icon: string }[] = [
  { value: 'latest', label: 'Mới nhất', icon: 'schedule' },
  { value: 'popular', label: 'Nhiều kết nối', icon: 'trending-up' },
  { value: 'name', label: 'Theo tên A→Z', icon: 'sort-by-alpha' },
];

const LABELS: Record<BusinessSort, string> = {
  latest: 'Mới nhất',
  popular: 'Nhiều kết nối',
  name: 'Tên A→Z',
};

const SortMenu: React.FC<SortMenuProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);

  const handleSelect = useCallback(
    (next: BusinessSort) => {
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <>
      <Pressable
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Sắp xếp: ${LABELS[value]}`}>
        <MaterialIcons name="sort" size={16} color={koolaColors.primary} />
        <KoolaText variant="caption" weight="600" tone="primary" style={{ marginHorizontal: 4 }}>
          {LABELS[value]}
        </KoolaText>
        <MaterialIcons name="expand-more" size={16} color={koolaColors.primary} />
      </Pressable>

      {/* Fabric-safe: do not mount native <Modal> (Dialog Window) until open.
          Eager mount with visible=false races RN's removeViewAt on Android Fabric. */}
      {open && (
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <KoolaText variant="caption" weight="700" tone="muted" style={styles.sheetTitle}>
              Sắp xếp theo
            </KoolaText>
            {SORT_OPTIONS.map((opt) => {
              const isActive = opt.value === value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.option, isActive && styles.optionActive]}
                  onPress={() => handleSelect(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}>
                  <MaterialIcons
                    name={opt.icon}
                    size={20}
                    color={isActive ? koolaColors.primary : koolaColors.muted}
                  />
                  <KoolaText
                    variant="body"
                    weight={isActive ? '600' : '400'}
                    tone={isActive ? 'primary' : 'ink'}
                    style={styles.optionText}>
                    {opt.label}
                  </KoolaText>
                  {isActive && (
                    <MaterialIcons
                      name="check"
                      size={20}
                      color={koolaColors.primary}
                      style={styles.checkIcon}
                    />
                  )}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: koolaRadii.xs,
    backgroundColor: koolaColors.primarySoft,
    minHeight: 34,
    marginRight: 8,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: koolaColors.surface,
    borderTopLeftRadius: koolaRadii.lg,
    borderTopRightRadius: koolaRadii.lg,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: koolaColors.line,
    marginBottom: 12,
  },
  sheetTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    minHeight: 48,
    borderRadius: koolaRadii.sm,
  },
  optionActive: {
    backgroundColor: koolaColors.primarySoft,
  },
  optionText: {
    flex: 1,
    marginLeft: 12,
  },
  checkIcon: {
    marginLeft: 'auto',
  },
});

export default SortMenu;
