/**
 * MentionTextInput.tsx
 *
 * Caption input that detects "@" typing and shows an autocomplete
 * list of connections. Renders highlighted mentions in the caption.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  type TextInputProps,
} from 'react-native';
import { KoolaText, koolaColors, koolaRadii } from '../../ui';
import { usersApi } from '../../services/api/apiService';
import type { MentionEntry } from '../../services/moments/momentsApi';

interface Props extends Omit<TextInputProps, 'onChangeText'> {
  value: string;
  onChangeText: (text: string) => void;
  onMentionsChange: (mentions: MentionEntry[]) => void;
  placeholder?: string;
}

interface SuggestionUser {
  _id: string;
  displayName: string;
}

const MentionTextInput: React.FC<Props> = ({
  value,
  onChangeText,
  onMentionsChange,
  placeholder = 'Thêm chú thích...',
  style,
  ...rest
}) => {
  const [suggestions, setSuggestions] = useState<SuggestionUser[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const mentionsRef = useRef<MentionEntry[]>([]);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChangeText = useCallback(
    (text: string) => {
      onChangeText(text);

      // Detect @ pattern: find the last "@" before cursor with no space after it
      const atIdx = text.lastIndexOf('@');
      if (atIdx !== -1) {
        const afterAt = text.slice(atIdx + 1);
        // Valid mention query: letters/numbers/underscores only
        if (/^\w*$/.test(afterAt) && afterAt.length <= 30) {
          setMentionQuery(afterAt);
          setMentionStart(atIdx);

          // Debounce search
          if (searchTimeout.current) clearTimeout(searchTimeout.current);
          searchTimeout.current = setTimeout(async () => {
            if (afterAt.length >= 1) {
              try {
                const result = await usersApi.searchUsers(afterAt, undefined);
                setSuggestions(
                  result.items.map((u) => ({ _id: u._id, displayName: u.displayName })),
                );
              } catch {
                setSuggestions([]);
              }
            } else {
              setSuggestions([]);
            }
          }, 200);
          return;
        }
      }

      setMentionQuery(null);
      setMentionStart(-1);
      setSuggestions([]);
    },
    [onChangeText],
  );

  const handleSelectMention = useCallback(
    (user: SuggestionUser) => {
      if (mentionStart < 0) return;
      const beforeMention = value.slice(0, mentionStart);
      const afterMention = value.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
      const insertedTag = `@${user.displayName}`;
      const newText = `${beforeMention}${insertedTag}${afterMention}`;

      const newMention: MentionEntry = {
        userId: user._id,
        username: user.displayName,
        offset: mentionStart,
        length: insertedTag.length,
      };

      // Update mentions array
      const updatedMentions = [
        ...mentionsRef.current.filter((m) => m.userId !== user._id),
        newMention,
      ];
      mentionsRef.current = updatedMentions;
      onMentionsChange(updatedMentions);

      onChangeText(newText);
      setSuggestions([]);
      setMentionQuery(null);
      setMentionStart(-1);
    },
    [value, mentionStart, mentionQuery, onChangeText, onMentionsChange],
  );

  return (
    <View style={styles.wrapper}>
      <TextInput
        {...rest}
        value={value}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={koolaColors.faint}
        multiline
        maxLength={500}
        style={[styles.input, style]}
        accessibilityLabel="Thêm chú thích"
        accessibilityHint="Nhập @ để đề cập bạn bè"
      />

      {suggestions.length > 0 && mentionQuery !== null && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item._id}
            keyboardShouldPersistTaps="always"
            style={styles.suggestionList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestionItem}
                onPress={() => handleSelectMention(item)}
                accessibilityRole="button"
                accessibilityLabel={`Đề cập ${item.displayName}`}>
                <KoolaText variant="body" tone="ink">
                  @{item.displayName}
                </KoolaText>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  input: {
    fontSize: 15,
    lineHeight: 22,
    color: koolaColors.ink,
    minHeight: 80,
    textAlignVertical: 'top',
    paddingVertical: 8,
  },
  suggestionsContainer: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    backgroundColor: koolaColors.surface,
    borderRadius: koolaRadii.md,
    borderWidth: 1,
    borderColor: koolaColors.line,
    maxHeight: 200,
    zIndex: 999,
  },
  suggestionList: {
    maxHeight: 200,
  },
  suggestionItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
});

export default MentionTextInput;
