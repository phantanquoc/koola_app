import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { VN_PROVINCES, normalizeVN } from '../../constants/provinces';

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
      <TouchableOpacity
        style={[styles.trigger, error && styles.triggerError]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={value || placeholder}>
        <Text
          style={[
            styles.triggerText,
            !value && styles.triggerPlaceholder,
          ]}
          numberOfLines={1}>
          {value || placeholder}
        </Text>
        <MaterialIcons name="expand-more" size={20} color="#6B7280" />
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={handleClose}
        presentationStyle="fullScreen">
        <SafeAreaView style={styles.modalContainer}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Đóng">
              <MaterialIcons name="arrow-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Chọn tỉnh/thành phố</Text>
          </View>

          <View style={styles.searchBox}>
            <MaterialIcons
              name="search"
              size={20}
              color="#9CA3AF"
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm tỉnh/thành..."
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => setQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Xóa tìm kiếm">
                <MaterialIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = item === value;
              return (
                <TouchableOpacity
                  style={[
                    styles.itemRow,
                    isSelected && styles.itemRowSelected,
                  ]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}>
                  <Text
                    style={[
                      styles.itemText,
                      isSelected && styles.itemTextSelected,
                    ]}>
                    {item}
                  </Text>
                  {isSelected && (
                    <MaterialIcons name="check" size={20} color="#1565C0" />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  Không tìm thấy tỉnh/thành phù hợp
                </Text>
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
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerError: {
    borderColor: '#DC2626',
  },
  triggerText: {
    fontSize: 14,
    color: '#1F2937',
    flex: 1,
  },
  triggerPlaceholder: {
    color: '#9CA3AF',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F1F5',
    borderRadius: 10,
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
    color: '#1F2937',
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
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemRowSelected: {
    backgroundColor: '#EFF6FF',
  },
  itemText: {
    fontSize: 15,
    color: '#1F2937',
  },
  itemTextSelected: {
    color: '#1565C0',
    fontWeight: '600',
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});

export default ProvincePicker;
