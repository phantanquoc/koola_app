import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { CATEGORY_LABELS } from '../../screens/connect/constants';

const RELATIONSHIP_LABELS: Record<string, string> = {
  partner: 'Đối tác',
  supplier: 'Nhà cung cấp',
};

interface EmptyConnectProps {
  activeCategory?: string;
  activeRelationship?: string;
  onClearFilters?: () => void;
}

const EmptyConnect: React.FC<EmptyConnectProps> = ({
  activeCategory,
  activeRelationship,
  onClearFilters,
}) => {
  let title = 'Chưa có doanh nghiệp nào';

  if (activeCategory) {
    const categoryName = CATEGORY_LABELS[activeCategory] || activeCategory;
    title = `Chưa có doanh nghiệp nào trong ngành ${categoryName}`;
  } else if (activeRelationship) {
    const relName = RELATIONSHIP_LABELS[activeRelationship] || activeRelationship;
    title = `Chưa có ${relName} nào được tìm thấy`;
  }

  const hasActiveFilter = Boolean(activeCategory || activeRelationship);

  return (
    <View style={styles.container}>
      <MaterialIcons name="handshake" size={64} color="#ccc" />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Hãy thử thay đổi bộ lọc để tìm kết quả phù hợp</Text>
      {hasActiveFilter && onClearFilters ? (
        <TouchableOpacity
          style={styles.clearBtn}
          onPress={onClearFilters}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Xóa bộ lọc">
          <MaterialIcons name="filter-alt-off" size={16} color="#1565C0" style={styles.clearIcon} />
          <Text style={styles.clearBtnText}>Xóa bộ lọc</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1565C0',
    backgroundColor: '#EFF6FF',
  },
  clearIcon: {
    marginRight: 6,
  },
  clearBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565C0',
  },
});

export default EmptyConnect;
