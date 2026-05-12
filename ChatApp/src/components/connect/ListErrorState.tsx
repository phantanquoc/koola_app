import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

interface ListErrorStateProps {
  message?: string;
  onRetry: () => void;
}

const ListErrorState: React.FC<ListErrorStateProps> = ({ message, onRetry }) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <MaterialIcons name="wifi-off" size={36} color="#DC2626" />
      </View>
      <Text style={styles.title}>Không thể tải dữ liệu</Text>
      <Text style={styles.subtitle}>
        {message || 'Kiểm tra kết nối mạng và thử lại.'}
      </Text>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={onRetry}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Thử lại">
        <MaterialIcons
          name="refresh"
          size={18}
          color="#FFFFFF"
          style={styles.retryIcon}
        />
        <Text style={styles.retryText}>Thử lại</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1565C0',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 44,
    minWidth: 140,
    marginTop: 8,
  },
  retryIcon: {
    marginRight: 6,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default ListErrorState;
