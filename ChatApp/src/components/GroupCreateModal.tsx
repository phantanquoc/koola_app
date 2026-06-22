import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import UserAvatar from './UserAvatar';
import { conversationsApi, usersApi } from '../services/api/apiService';
import { useTabDockSuppression } from '../navigation/MainNavigator';
import type { Conversation, UserSearchResult } from '../types';
import {
  KoolaButton,
  KoolaText,
  KoolaTextInput,
  koolaColors,
  koolaRadii,
  koolaShadows,
  koolaSpacing,
} from '../ui';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (conversation: Conversation) => void;
}

const SEARCH_MIN_LENGTH = 2;

function getErrorMessage(err: unknown, fallback: string): string {
  const error = err as { response?: { data?: { message?: string } }; message?: string };
  return error.response?.data?.message || error.message || fallback;
}

const GroupCreateModal: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const suppressTabDock = useTabDockSuppression();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const searchRequestRef = useRef(0);
  const latestQueryRef = useRef('');

  useEffect(() => {
    if (!visible) return undefined;
    return suppressTabDock();
  }, [suppressTabDock, visible]);

  const resetState = useCallback(() => {
    searchRequestRef.current += 1;
    latestQueryRef.current = '';
    setName('');
    setQuery('');
    setResults([]);
    setSelectedUsers([]);
    setSearchLoading(false);
    setLoadingMore(false);
    setCreating(false);
    setSearchError(null);
    setCreateError(null);
    setHasMore(false);
    setNextCursor(null);
  }, []);

  const handleClose = useCallback(() => {
    if (creating) return;
    resetState();
    onClose();
  }, [creating, onClose, resetState]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    latestQueryRef.current = trimmedQuery;

    if (trimmedQuery.length < SEARCH_MIN_LENGTH) {
      searchRequestRef.current += 1;
      setResults([]);
      setSearchLoading(false);
      setSearchError(null);
      setHasMore(false);
      setNextCursor(null);
      return;
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setSearchLoading(true);
    setSearchError(null);
    setHasMore(false);
    setNextCursor(null);

    const timer = setTimeout(() => {
      usersApi
        .searchUsers(trimmedQuery)
        .then((data) => {
          if (
            searchRequestRef.current !== requestId ||
            latestQueryRef.current !== trimmedQuery
          ) {
            return;
          }
          setResults(data.items);
          setHasMore(data.hasMore);
          setNextCursor(data.nextCursor);
        })
        .catch((err: unknown) => {
          if (
            searchRequestRef.current !== requestId ||
            latestQueryRef.current !== trimmedQuery
          ) {
            return;
          }
          setResults([]);
          setHasMore(false);
          setNextCursor(null);
          setSearchError(
            getErrorMessage(err, 'Không tìm kiếm được thành viên. Bạn thử lại nhé.'),
          );
        })
        .finally(() => {
          if (searchRequestRef.current === requestId) {
            setSearchLoading(false);
          }
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const selectedIds = useMemo(
    () => new Set(selectedUsers.map((user) => user._id)),
    [selectedUsers],
  );

  const canCreate =
    name.trim().length > 0 &&
    selectedUsers.length > 0 &&
    !searchLoading &&
    !creating;

  const toggleUser = useCallback((user: UserSearchResult) => {
    setSelectedUsers((current) => {
      if (current.some((selected) => selected._id === user._id)) {
        return current.filter((selected) => selected._id !== user._id);
      }
      return [...current, user];
    });
    setCreateError(null);
  }, []);

  const removeSelectedUser = useCallback((userId: string) => {
    setSelectedUsers((current) => current.filter((user) => user._id !== userId));
  }, []);

  const handleLoadMore = useCallback(async () => {
    const queryAtRequest = latestQueryRef.current;
    const cursorAtRequest = nextCursor;
    if (!hasMore || !cursorAtRequest || loadingMore || searchLoading) return;

    setLoadingMore(true);
    setSearchError(null);
    try {
      const data = await usersApi.searchUsers(queryAtRequest, cursorAtRequest);
      if (latestQueryRef.current !== queryAtRequest) return;
      setResults((current) => {
        const seen = new Set(current.map((user) => user._id));
        const additions = data.items.filter((user) => !seen.has(user._id));
        return [...current, ...additions];
      });
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch (err: unknown) {
      if (latestQueryRef.current !== queryAtRequest) return;
      setSearchError(
        getErrorMessage(err, 'Không tải thêm được thành viên. Bạn thử lại nhé.'),
      );
    } finally {
      if (latestQueryRef.current === queryAtRequest) {
        setLoadingMore(false);
      }
    }
  }, [hasMore, loadingMore, nextCursor, searchLoading]);

  const handleCreate = useCallback(async () => {
    if (!canCreate || creating) return;

    setCreating(true);
    setCreateError(null);
    try {
      const { conversation } = await conversationsApi.createGroup(
        name.trim(),
        selectedUsers.map((user) => user._id),
      );
      onCreated(conversation);
      resetState();
      onClose();
    } catch (err: unknown) {
      const message = getErrorMessage(
        err,
        'Không tạo được nhóm. Bạn kiểm tra lại thành viên rồi thử lại nhé.',
      );
      setCreateError(message);
      Alert.alert('Không tạo được nhóm', message);
    } finally {
      setCreating(false);
    }
  }, [canCreate, creating, name, onClose, onCreated, resetState, selectedUsers]);

  const renderSearchBody = () => {
    if (query.trim().length < SEARCH_MIN_LENGTH) {
      return (
        <KoolaText variant="caption" tone="muted" style={styles.helperText}>
          Nhập ít nhất 2 ký tự để tìm bạn bè theo tên hoặc email.
        </KoolaText>
      );
    }

    if (searchLoading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator color={koolaColors.primary} />
          <KoolaText variant="caption" tone="muted" style={styles.centerStateText}>
            Đang tìm thành viên...
          </KoolaText>
        </View>
      );
    }

    if (searchError) {
      return (
        <View style={styles.messageCard}>
          <KoolaText variant="caption" tone="danger">
            {searchError}
          </KoolaText>
        </View>
      );
    }

    if (results.length === 0) {
      return (
        <View style={styles.messageCard}>
          <KoolaText variant="caption" tone="muted">
            Chưa tìm thấy ai phù hợp. Thử tên hoặc email khác nhé.
          </KoolaText>
        </View>
      );
    }

    return (
      <View style={styles.resultsList}>
        {results.map((user) => {
          const selected = selectedIds.has(user._id);
          return (
            <Pressable
              key={user._id}
              accessibilityRole="button"
              accessibilityLabel={`${selected ? 'Bỏ chọn' : 'Chọn'} ${user.displayName}`}
              accessibilityState={{ selected }}
              android_ripple={{ color: koolaColors.primarySoft }}
              onPress={() => toggleUser(user)}
              style={({ pressed }) => [
                styles.userRow,
                selected ? styles.userRowSelected : null,
                pressed ? styles.pressed : null,
              ]}>
              <UserAvatar
                displayName={user.displayName || user.email}
                avatar={user.avatar}
                size={42}
              />
              <View style={styles.userInfo}>
                <KoolaText variant="label" weight="700" numberOfLines={1}>
                  {user.displayName || user.email}
                </KoolaText>
                <KoolaText variant="caption" tone="muted" numberOfLines={1}>
                  {user.email}
                </KoolaText>
              </View>
              <View style={styles.statusWrap}>
                <View
                  style={[
                    styles.statusDot,
                    user.isOnline ? styles.onlineDot : styles.offlineDot,
                  ]}
                />
                <KoolaText variant="caption" tone={user.isOnline ? 'success' : 'faint'}>
                  {user.isOnline ? 'Online' : 'Offline'}
                </KoolaText>
              </View>
            </Pressable>
          );
        })}
        {hasMore ? (
          <KoolaButton
            title="Tải thêm"
            variant="secondary"
            size="sm"
            loading={loadingMore}
            disabled={loadingMore}
            accessibilityRole="button"
            accessibilityLabel="Tải thêm kết quả tìm kiếm thành viên"
            onPress={handleLoadMore}
            style={styles.loadMoreButton}
          />
        ) : null}
      </View>
    );
  };

  // Keep the sheet in-tree to avoid Android Fabric native Dialog freezes, and
  // suppress the floating tab dock while visible so the sheet owns the top layer.
  if (!visible) return null;

  return (
    <View style={styles.overlayHost} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Đóng tạo nhóm"
        disabled={creating}
        onPress={handleClose}
        style={({ pressed }) => [
          styles.backdrop,
          pressed && !creating ? styles.backdropPressed : null,
        ]}
      />
      <KeyboardAvoidingView
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}>
        <Pressable style={styles.sheetPressGuard} onPress={() => undefined}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <KoolaText variant="heading" weight="800">
                  Tạo nhóm mới
                </KoolaText>
                <KoolaText variant="caption" tone="muted" style={styles.subtitle}>
                  Tìm và chọn thành viên, không cần nhập ID thủ công.
                </KoolaText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng tạo nhóm"
                disabled={creating}
                android_ripple={{ color: koolaColors.line, borderless: true }}
                onPress={handleClose}
                style={({ pressed }) => [
                  styles.closeButton,
                  creating ? styles.disabled : null,
                  pressed && !creating ? styles.pressed : null,
                ]}>
                <KoolaText variant="heading" tone="muted" weight="700">
                  ×
                </KoolaText>
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}>
              <KoolaTextInput
                label="Tên nhóm"
                placeholder="Tên nhóm"
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  setCreateError(null);
                }}
                editable={!creating}
                returnKeyType="next"
                underlineColorAndroid="transparent"
              />

              <View style={styles.section}>
                <KoolaTextInput
                  label="Thành viên"
                  placeholder="Tìm theo tên hoặc email"
                  value={query}
                  onChangeText={setQuery}
                  editable={!creating}
                  autoCapitalize="none"
                  autoCorrect={false}
                  icon="search"
                  underlineColorAndroid="transparent"
                />
                {renderSearchBody()}
              </View>

              <View style={styles.section}>
                <KoolaText variant="caption" tone="muted" weight="700">
                  Đã chọn {selectedUsers.length} thành viên
                </KoolaText>
                {selectedUsers.length > 0 ? (
                  <View style={styles.selectedWrap}>
                    {selectedUsers.map((user) => (
                      <View key={user._id} style={styles.selectedChip}>
                        <UserAvatar
                          displayName={user.displayName || user.email}
                          avatar={user.avatar}
                          size={26}
                        />
                        <KoolaText
                          variant="caption"
                          weight="700"
                          numberOfLines={1}
                          style={styles.selectedName}>
                          {user.displayName || user.email}
                        </KoolaText>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Bỏ ${user.displayName || user.email} khỏi nhóm`}
                          disabled={creating}
                          hitSlop={8}
                          onPress={() => removeSelectedUser(user._id)}
                          style={({ pressed }) => [
                            styles.removeButton,
                            pressed && !creating ? styles.pressed : null,
                          ]}>
                          <KoolaText variant="caption" tone="danger" weight="800">
                            ×
                          </KoolaText>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <KoolaText variant="caption" tone="faint" style={styles.helperText}>
                    Chọn ít nhất một thành viên để tạo nhóm.
                  </KoolaText>
                )}
              </View>

              {createError ? (
                <View style={styles.errorBox}>
                  <KoolaText variant="caption" tone="danger">
                    {createError}
                  </KoolaText>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <KoolaButton
                title="Tạo nhóm"
                size="lg"
                loading={creating}
                disabled={!canCreate}
                accessibilityRole="button"
                accessibilityLabel="Tạo nhóm mới với các thành viên đã chọn"
                onPress={handleCreate}
              />
            </View>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 24, 40, 0.46)',
  },
  backdropPressed: {
    opacity: 0.94,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetPressGuard: {
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: koolaColors.surface,
    borderTopLeftRadius: koolaRadii.lg,
    borderTopRightRadius: koolaRadii.lg,
    paddingTop: koolaSpacing.sm,
    ...koolaShadows.soft,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: koolaRadii.pill,
    backgroundColor: koolaColors.line,
    marginBottom: koolaSpacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: koolaSpacing.xl,
    paddingBottom: koolaSpacing.lg,
  },
  headerCopy: {
    flex: 1,
    paddingRight: koolaSpacing.md,
  },
  subtitle: {
    marginTop: koolaSpacing.xs,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: koolaColors.canvas,
  },
  content: {
    paddingHorizontal: koolaSpacing.xl,
    paddingBottom: koolaSpacing.lg,
  },
  section: {
    marginTop: koolaSpacing.lg,
  },
  helperText: {
    marginTop: koolaSpacing.sm,
  },
  centerState: {
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: koolaRadii.md,
    backgroundColor: koolaColors.canvas,
    marginTop: koolaSpacing.sm,
  },
  centerStateText: {
    marginTop: koolaSpacing.sm,
  },
  messageCard: {
    borderRadius: koolaRadii.md,
    backgroundColor: koolaColors.canvas,
    padding: koolaSpacing.md,
    marginTop: koolaSpacing.sm,
  },
  resultsList: {
    marginTop: koolaSpacing.sm,
    borderRadius: koolaRadii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    overflow: 'hidden',
  },
  userRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: koolaSpacing.md,
    paddingVertical: koolaSpacing.sm,
    backgroundColor: koolaColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  userRowSelected: {
    backgroundColor: koolaColors.primarySoft,
  },
  userInfo: {
    flex: 1,
    marginLeft: koolaSpacing.md,
    marginRight: koolaSpacing.sm,
  },
  statusWrap: {
    minWidth: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: koolaSpacing.xs,
  },
  onlineDot: {
    backgroundColor: koolaColors.success,
  },
  offlineDot: {
    backgroundColor: koolaColors.faint,
  },
  loadMoreButton: {
    margin: koolaSpacing.md,
  },
  selectedWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: koolaSpacing.sm,
  },
  selectedChip: {
    maxWidth: '100%',
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: koolaRadii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    backgroundColor: koolaColors.canvas,
    paddingLeft: koolaSpacing.xs,
    paddingRight: koolaSpacing.sm,
    marginRight: koolaSpacing.sm,
    marginBottom: koolaSpacing.sm,
  },
  selectedName: {
    maxWidth: 180,
    marginLeft: koolaSpacing.sm,
    marginRight: koolaSpacing.xs,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    borderRadius: koolaRadii.md,
    backgroundColor: koolaColors.dangerSoft,
    padding: koolaSpacing.md,
    marginTop: koolaSpacing.md,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: koolaColors.line,
    paddingHorizontal: koolaSpacing.xl,
    paddingTop: koolaSpacing.md,
    paddingBottom: Platform.OS === 'ios' ? koolaSpacing.xl : koolaSpacing.lg,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.55,
  },
});

export default GroupCreateModal;
