import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Pressable,
  Modal,
  TextInput,
  FlatList,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { VN_PROVINCES, normalizeVN } from '../../constants/provinces';
import {
  KoolaIconButton,
  KoolaText,
  koolaColors,
  koolaRadii,
} from '../../ui';

interface ProvincePickerProps {
  value: string;
  onChange: (province: string) => void;
  placeholder?: string;
  error?: boolean;
}

const ProvincePicker: React.FC<ProvincePickerProps> = ({
  value,
  onChange,
  placeholder = 'Chọn tỉnh/thành phố',
  error,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return VN_PROVINCES;
    const normalized = normalizeVN(query.trim());
    return VN_PROVINCES.filter((p) =>
      normalizeVN(p).includes(normalized),
    );
  }, [query]);

  const handleSelect = useCallback(
    (province: string) => {
      onChange(province);
      setOpen(false);
      setQuery('');
    },
    [onChange],
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  return (
    <>
      <Pressable
        style={[styles.trigger, error ? styles.triggerError : null]}
        android_ripple={{ color: koolaColors.canvas }}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={value || placeholder}>
        <KoolaText
          variant="body"
          tone={value ? 'ink' : 'faint'}
          numberOfLines={1}
          style={styles.triggerText}>
          {value || placeholder}
        </KoolaText>
        <MaterialIcons name="expand-more" size={20} color={koolaColors.muted} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={handleClose}
        presentationStyle="fullScreen">
        <SafeAreaView style={styles.modalContainer}>
          <StatusBar barStyle="dark-content" backgroundColor={koolaColors.surface} />
          <View style={styles.modalHeader}>
            <KoolaIconButton
              icon="arrow-back"
              tone="muted"
              size={44}
              iconSize={24}
              onPress={handleClose}
              accessibilityLabel="Đóng"
            />
            <KoolaText variant="heading" weight="700" style={styles.modalTitle}>
              Chọn tỉnh/thành phố
            </KoolaText>
          </View>

          <View style={styles.searchBox}>
            <MaterialIcons
              name="search"
              size={20}
              color={koolaColors.faint}
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm tỉnh/thành..."
              placeholderTextColor={koolaColors.faint}
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable
                style={styles.clearBtn}
                onPress={() => setQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Xóa tìm kiếm">
                <MaterialIcons name="close" size={20} color={koolaColors.faint} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              value ? (
                <Pressable
                  style={styles.itemRow}
                  android_ripple={{ color: koolaColors.canvas }}
                  onPress={() => handleSelect('')}
                  accessibilityRole="button"
                  accessibilityLabel="Xóa bộ lọc tỉnh/thành">
                  <KoolaText tone="danger" weight="600">
                    Xóa bộ lọc
                  </KoolaText>
                  <MaterialIcons
                    name="close"
                    size={18}
                    color={koolaColors.danger}
                  />
                </Pressable>
              ) : null
            }
            renderItem={({ item }) => {
              const isSelected = item === value;
              return (
                <Pressable
                  style={[styles.itemRow, isSelected ? styles.itemRowSelected : null]}
                  android_ripple={{ color: koolaColors.canvas }}
                  onPress={() => handleSelect(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}>
                  <KoolaText
                    tone={isSelected ? 'primary' : 'ink'}
                    weight={isSelected ? '600' : '400'}>
                    {item}
                  </KoolaText>
                  {isSelected && (
                    <MaterialIcons
                      name="check"
                      size={20}
                      color={koolaColors.primary}
                    />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <KoolaText tone="faint">
                  Không tìm thấy tỉnh/thành phù hợp
                </KoolaText>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    backgroundColor: koolaColors.surface,
    borderRadius: koolaRadii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerError: {
    borderColor: koolaColors.danger,
  },
  triggerText: {
    flex: 1,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: koolaColors.surface,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
    gap: 8,
  },
  modalTitle: {
    flex: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: koolaColors.canvas,
    borderRadius: koolaRadii.sm,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: koolaColors.ink,
    paddingVertical: 0,
  },
  clearBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  itemRowSelected: {
    backgroundColor: koolaColors.primarySoft,
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
});

export default ProvincePicker;
