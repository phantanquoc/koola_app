import React, { useRef, useCallback } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface Props {
  onSearch: (query: string) => void;
}

const ContactSearchBar: React.FC<Props> = ({ onSearch }) => {
  const [text, setText] = React.useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      setText(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        if (value.trim().length >= 2) {
          onSearch(value.trim());
        } else {
          onSearch('');
        }
      }, 300);
    },
    [onSearch],
  );

  const handleClear = () => {
    setText('');
    onSearch('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔍</Text>
      <TextInput
        style={styles.input}
        placeholder="Search by name or email"
        placeholderTextColor="#999"
        value={text}
        onChangeText={handleChange}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {text.length > 0 && (
        <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
          <Text style={styles.clearText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', margin: 12,
    backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, height: 44,
  },
  icon: { fontSize: 16, marginRight: 8 },
  input: { flex: 1, fontSize: 16, color: '#333' },
  clearButton: { padding: 4 },
  clearText: { fontSize: 16, color: '#999' },
});

export default ContactSearchBar;
