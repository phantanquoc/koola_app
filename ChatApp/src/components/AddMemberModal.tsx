import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import UserAvatar from './UserAvatar';
import { usersApi } from '../services/api/apiService';
import type { UserSearchResult } from '../types';
import {
  KoolaButton,
  KoolaText,
  KoolaTextInput,
  koolaRadii,
  koolaSpacing,
  useTheme,
} from '../ui';
import type { SemanticTokens } from '../ui/tokens/semantic';

const SEARCH_MIN_LENGTH = 2;

interface Props {
  visible: boolean;
  /** IDs of users already in the group (to exclude from results) */
  existingMemberIds: string[];
  /** Current user ID (to exclude self) */
  currentUserId: string;
  onClose: () => void;
  onAdd: (userIds: string[]) => Promise<void>;
}

function getErrorMessage(err: unknown, fallback: string): string {
  const error = err as { response?: { data?: { message?: string } }; message?: string };
  return error.response?.data?.message || error.message || fallback;
}

const AddMemberModal: React.FC<Props> = ({
  visible,
  existingMemberIds,
  currentUserId,
  onClose,
  onAdd,
}) => {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const searchRequestRef = useRef(0);
  const latestQueryRef = useRef('');

  // Exclusion set: existing members + self
  const excludeIds = useMemo(
    () => new Set([...existingMemberIds, currentUserId]),
    [existingMemberIds, currentUserId],
  );

  const resetState = useCallback(() => {
    searchRequestRef.current += 1;
    latestQueryRef.current = '';
    setQuery('');
    setResults([]);
    setSelectedUsers([]);
    setSearchLoading(false);
    setSearchError(null);
    setSubmitting(false);
    setSubmitError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    resetState();
    onClose();
  }, [submitting, onClose, resetState]);

  // Debounced user search
  useEffect(() => {
    const trimmedQuery = query.trim();
    latestQueryRef.current = trimmedQuery;

    if (trimmedQuery.length < SEARCH_MIN_LENGTH) {
      searchRequestRef.current += 1;
      setResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setSearchLoading(true);
    setSearchError(null);

    const timer = setTimeout(() => {
      usersApi
        .searchUsers(trimmedQuery)
        .then((data) => {
          if (searchRequestRef.current !== requestId || latestQueryRef.current !== trimmedQuery) return;
          // Filter out excluded users
          const filtered = data.items.filter((u) => !excludeIds.has(u._id));
          setResults(filtered);
        })
        .catch((err: unknown) => {
          if (searchRequestRef.current !== requestId || latestQueryRef.current !== trimmedQuery) return;
          setResults([]);
          setSearchError(getErrorMessage(err, 'Không tìm kiếm được. Thử lại nhé.'));
        })
        .finally(() => {
          if (searchRequestRef.current === requestId) setSearchLoading(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [query, excludeIds]);

  const selectedIds = useMemo(
    () => new Set(selectedUsers.map((u) => u._id)),
    [selectedUsers],
  );

  const toggleUser = useCallback((user: UserSearchResult) => {
    setSelectedUsers((current) => {
      if (current.some((s) => s._id === user._id)) {
        return current.filter((s) => s._id !== user._id);
      }
      return [...current, user];
    });
    setSubmitError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (selectedUsers.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onAdd(selectedUsers.map((u) => u._id));
      resetState();
      onClose();
    } catch (err: unknown) {
      setSubmitError(getErrorMessage(err, 'Không thể thêm thành viên. Thử lại nhé.'));
    } finally {
      setSubmitting(false);
    }
  }, [selectedUsers, submitting, onAdd, onClose, resetState]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} transparent={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Đóng">
            <KoolaText weight="500">Hủy</KoolaText>
          </Pressable>
          <KoolaText variant="heading" weight="700" style={styles.title}>Thêm thành viên</KoolaText>
          <View style={styles.closeBtn} />
        </View>

        {/* Search input */}
        <View style={styles.searchRow}>
          <KoolaTextInput
            placeholder="Tìm theo tên hoặc email"
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Tìm kiếm thành viên"
          />
        </View>

        {/* Selected chips */}
        {selectedUsers.length > 0 && (
          <ScrollView horizontal style={styles.chipsRow} showsHorizontalScrollIndicator={false}>
            {selectedUsers.map((u) => (
              <Pressable
                key={u._id}
                style={styles.chip}
                onPress={() => toggleUser(u)}
                accessibilityRole="button"
                accessibilityLabel={`Bỏ chọn ${u.displayName}`}>
                <UserAvatar displayName={u.displayName || u.email} avatar={u.avatar} size={24} />
                <KoolaText variant="caption" weight="600" numberOfLines={1} style={styles.chipText}>
                  {u.displayName || u.email}
                </KoolaText>
                <KoolaText variant="caption" tone="muted">✕</KoolaText>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Results */}
        <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
          {query.trim().length < SEARCH_MIN_LENGTH ? (
            <KoolaText variant="caption" tone="muted" style={styles.helper}>
              Nhập ít nhất 2 ký tự để tìm người dùng.
            </KoolaText>
          ) : searchLoading ? (
            <ActivityIndicator style={styles.loader} color={tokens.semantic.action.primary} />
          ) : searchError ? (
            <KoolaText variant="caption" tone="danger" style={styles.helper}>
              {searchError}
            </KoolaText>
          ) : results.length === 0 ? (
            <KoolaText variant="caption" tone="muted" style={styles.helper}>
              Không tìm thấy người dùng phù hợp.
            </KoolaText>
          ) : (
            results.map((user) => {
              const selected = selectedIds.has(user._id);
              return (
                <Pressable
                  key={user._id}
                  style={[styles.userRow, selected && styles.userRowSelected]}
                  onPress={() => toggleUser(user)}
                  accessibilityRole="button"
                  accessibilityLabel={`${selected ? 'Bỏ chọn' : 'Chọn'} ${user.displayName}`}
                  accessibilityState={{ selected }}>
                  <UserAvatar displayName={user.displayName || user.email} avatar={user.avatar} size={42} />
                  <View style={styles.userInfo}>
                    <KoolaText variant="label" weight="700" numberOfLines={1}>
                      {user.displayName || user.email}
                    </KoolaText>
                    <KoolaText variant="caption" tone="muted" numberOfLines={1}>
                      {user.email}
                    </KoolaText>
                  </View>
                  <View style={[styles.checkBox, selected && styles.checkBoxSelected]}>
                    {selected && <KoolaText style={styles.checkMark}>✓</KoolaText>}
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        {/* Submit error */}
        {submitError && (
          <KoolaText variant="caption" tone="danger" style={styles.submitError}>
            {submitError}
          </KoolaText>
        )}

        {/* Submit button */}
        <View style={styles.footer}>
          <KoolaButton
            title={submitting ? 'Đang thêm...' : `Thêm (${selectedUsers.length})`}
            onPress={handleSubmit}
            disabled={selectedUsers.length === 0 || submitting}
            accessibilityLabel="Xác nhận thêm thành viên"
          />
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: semantic.bg.canvas },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
    closeBtn: { width: 50 },
    title: { flex: 1, textAlign: 'center' },
    searchRow: { paddingHorizontal: 16, marginBottom: 8 },
    chipsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, maxHeight: 44 },
    chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: semantic.action.primarySoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16, marginRight: 8 },
    chipText: { maxWidth: 80, marginLeft: 6 },
    results: { flex: 1 },
    helper: { paddingHorizontal: 16, paddingVertical: 20 },
    loader: { paddingVertical: 24 },
    userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
    userRowSelected: { backgroundColor: semantic.action.primarySoft },
    userInfo: { flex: 1, marginLeft: 12 },
    checkBox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: semantic.border.subtle, alignItems: 'center', justifyContent: 'center' },
    checkBoxSelected: { borderColor: semantic.action.primary, backgroundColor: semantic.action.primary },
    checkMark: { color: semantic.text.onAction, fontSize: 14, fontWeight: '700' },
    submitError: { paddingHorizontal: 16, paddingBottom: 4 },
    footer: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },
  });

export default AddMemberModal;
