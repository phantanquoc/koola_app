/**
 * ContactSearchBar — text input with debounced onSearch callback.
 * Shows search icon, clear button when text present.
 */
import React, { useCallback, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const DEBOUNCE_MS = 300;

export interface ContactSearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export const ContactSearchBar: React.FC<ContactSearchBarProps> = ({
  onSearch,
  placeholder = 'Search people by name or email',
}) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const handleChangeText = useCallback(
    (text: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      if (text.length < 2) {
        onSearch(text);
        return;
      }

      timerRef.current = setTimeout(() => {
        onSearch(text);
      }, DEBOUNCE_MS);
    },
    [onSearch],
  );

  const handleClear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    inputRef.current?.clear();
    onSearch('');
  }, [onSearch]);

  return (
    <View style={styles.container}>
      <MaterialIcons name="search" size={20} color="#888" style={styles.searchIcon} />
      <TextInput
        ref={inputRef}
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#999"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={handleChangeText}
        returnKeyType="search"
      />
      <TouchableOpacity onPress={handleClear} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialIcons name="close" size={18} color="#aaa" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
    padding: 0,
    height: 40,
  },
  clearBtn: {
    marginLeft: 4,
    padding: 2,
  },
});
