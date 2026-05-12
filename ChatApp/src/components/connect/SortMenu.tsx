import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { BusinessSort } from '../../types';

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
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Sắp xếp: ${LABELS[value]}`}>
        <MaterialIcons name="sort" size={16} color="#1565C0" />
        <Text style={styles.triggerText}>{LABELS[value]}</Text>
        <MaterialIcons name="expand-more" size={16} color="#1565C0" />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Sắp xếp theo</Text>
            {SORT_OPTIONS.map((opt) => {
              const isActive = opt.value === value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.option, isActive && styles.optionActive]}
                  onPress={() => handleSelect(opt.value)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}>
                  <MaterialIcons
                    name={opt.icon}
                    size={20}
                    color={isActive ? '#1565C0' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      isActive && styles.optionTextActive,
                    ]}>
                    {opt.label}
                  </Text>
                  {isActive && (
                    <MaterialIcons
                      name="check"
                      size={20}
                      color="#1565C0"
                      style={styles.checkIcon}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    minHeight: 32,
  },
  triggerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1565C0',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    minHeight: 48,
    borderRadius: 10,
  },
  optionActive: {
    backgroundColor: '#F0F9FF',
  },
  optionText: {
    fontSize: 15,
    color: '#1F2937',
    flex: 1,
  },
  optionTextActive: {
    color: '#1565C0',
    fontWeight: '600',
  },
  checkIcon: {
    marginLeft: 'auto',
  },
});

export default SortMenu;
