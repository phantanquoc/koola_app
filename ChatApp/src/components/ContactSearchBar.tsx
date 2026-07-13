import React, { useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { KoolaSearchField } from '../ui';

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
    <View style={styles.wrapper}>
      <KoolaSearchField
        value={text}
        onChangeText={handleChange}
        onClear={handleClear}
        placeholder="Tìm theo tên hoặc email"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    margin: 12,
  },
});

export default ContactSearchBar;
