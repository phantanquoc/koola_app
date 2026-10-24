import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import UserAvatar from './UserAvatar';
import { conversationsApi, usersApi } from '../services/api/apiService';
import { koolaConfirm } from '../ui/KoolaConfirmHost';
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
import {
  koolaDurations,
  koolaEasing,
  prefersReducedMotion,
} from '../ui/tokens/motion';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (conversation: Conversation) => void;
  /**
   * Callback ref to the form's guarded close. The Chat Home overlay owner
   * forwards hardware Back here so Back and the ✕ share one guard (design D4);
   * React calls it with `null` on unmount.
   */
  requestCloseRef?: (requestClose: (() => void) | null) => void;
}

const SEARCH_MIN_LENGTH = 2;

/**
 * Fallback travel distance for the panel slide-in until the panel's real
 * height is measured. Sits beyond any tall panel (`maxHeight: '92%'`) so the
 * form always starts off-screen instead of clipping a percentage.
 */
const PANEL_SLIDE_FALLBACK = 720;

function getErrorMessage(err: unknown, fallback: string): string {
  const error = err as { response?: { data?: { message?: string } }; message?: string };
  // Log diagnostic detail in dev; always show VN fallback to user
  if (__DEV__) {
    console.warn('[GroupCreateModal]', error.response?.data?.message || error.message);
  }
  return fallback;
}

const GroupCreateModal: React.FC<Props> = ({ visible, onClose, onCreated, requestCloseRef }) => {
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
  // Generation of the form session: bumped whenever the draft is discarded.
  // A create response from an older generation (the user confirmed discard
  // mid-flight) must not navigate, apply an error or touch the draft.
  const sessionRef = useRef(0);
  // Generation of the create REQUEST (distinct from the form session). Every
  // request gets its own token; the loading flag belongs to the token and is
  // cleared by that request's own `finally` no matter which session it started
  // in (the modal is always mounted, so a discarded request must still release
  // the spinner before the next open).
  const createRequestRef = useRef(0);

  const resetState = useCallback(() => {
    sessionRef.current += 1;
    // Detaches the in-flight request (if any) from this form session.
    createRequestRef.current += 1;
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

  // Rising edge of `visible` → the form is guaranteed to open clean. The owner
  // resets on every close path; this covers a caller that hides the form
  // without going through requestClose, so a stale draft or spinner can never
  // be handed back on the next open.
  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !wasVisibleRef.current) resetState();
    wasVisibleRef.current = visible;
  }, [visible, resetState]);

  // ─── Entrance (scrim fade + panel slide-up) ────────────────────────────────
  // Native driver: both animated properties are opacity / transform only, so
  // the two short one-shot timings run on the UI thread. Exit is instant (app
  // dialog standard): every close path hands straight off to another surface.
  const [backdropProgress] = useState(() => new Animated.Value(0));
  const [panelProgress] = useState(() => new Animated.Value(0));
  // Initial value only — onLayout measures the real panel.
  const [panelHeight, setPanelHeight] = useState(PANEL_SLIDE_FALLBACK);

  useEffect(() => {
    if (!visible) return;
    if (prefersReducedMotion()) {
      backdropProgress.setValue(1);
      panelProgress.setValue(1);
      return;
    }
    backdropProgress.setValue(0);
    panelProgress.setValue(0);
    const decelerate = Easing.bezier(...koolaEasing.decelerate);
    Animated.parallel([
      Animated.timing(backdropProgress, {
        toValue: 1,
        duration: koolaDurations.normal,
        easing: decelerate,
        useNativeDriver: true,
      }),
      // The panel is near-full-height, so a 0.94 scale would read as a jitter
      // rather than a deliberate zoom — it slides instead.
      Animated.timing(panelProgress, {
        toValue: 1,
        duration: koolaDurations.slow,
        easing: decelerate,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, backdropProgress, panelProgress]);

  const panelTransform = useMemo(
    () => ({
      opacity: panelProgress,
      transform: [
        {
          translateY: panelProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [panelHeight, 0],
          }),
        },
      ],
    }),
    [panelProgress, panelHeight],
  );

  const handlePanelLayout = useCallback((height: number) => {
    // Ignore degenerate measurements (0 before layout / during teardown).
    if (height > 1) setPanelHeight(height);
  }, []);

  // ─── Guarded close (backdrop, ✕, hardware Back) ────────────────────────────
  // While a create is in flight closing asks first instead of being disabled,
  // so the user is never trapped. The HTTP request is not aborted: closing is
  // a client-side discard, and the late result is ignored through the session
  // generation counter (sessionRef). resetState() also detaches the request
  // (createRequestRef), so its own `finally` still clears the spinner later.
  const requestClose = useCallback(() => {
    if (creating) {
      koolaConfirm({
        title: 'Huỷ tạo nhóm?',
        message:
          'Nhóm đang được tạo. Nếu huỷ và đóng, bạn sẽ rời khỏi màn hình trước khi nhóm hoàn tất.',
        confirmLabel: 'Huỷ và đóng',
        cancelLabel: 'Tiếp tục tạo',
        destructive: true,
        onConfirm: () => {
          resetState();
          onClose();
        },
      });
      return;
    }
    resetState();
    onClose();
  }, [creating, onClose, resetState]);

  // Owner-facing guard: the Chat Home overlay owner's Back handler calls this.
  useEffect(() => {
    if (!requestCloseRef) return undefined;
    requestCloseRef(requestClose);
    return () => requestCloseRef(null);
  }, [requestClose, requestCloseRef]);

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

    // Two independent generations per request: the SESSION decides whether the
    // result may touch the form (draft / navigation / error), the REQUEST
    // decides who clears the loading flag (only the latest request does, and it
    // always does — even after its session was discarded).
    const sessionAtRequest = sessionRef.current;
    const requestId = createRequestRef.current + 1;
    createRequestRef.current = requestId;
    const belongsToSession = () => sessionRef.current === sessionAtRequest;
    const isLatestRequest = () => createRequestRef.current === requestId;

    setCreating(true);
    setCreateError(null);
    try {
      const { conversation } = await conversationsApi.createGroup(
        name.trim(),
        selectedUsers.map((user) => user._id),
      );
      // The draft was discarded while the request was in flight (the user
      // confirmed "Huỷ và đóng"): the server-side group will arrive on the next
      // sync, but this form must not navigate away or resurrect the draft.
      if (!belongsToSession() || !isLatestRequest()) return;
      onCreated(conversation);
      resetState();
      onClose();
    } catch (err: unknown) {
      if (!belongsToSession() || !isLatestRequest()) return;
      const message = getErrorMessage(
        err,
        'Không tạo được nhóm. Bạn kiểm tra lại thành viên rồi thử lại nhé.',
      );
      setCreateError(message);
      Alert.alert('Không tạo được nhóm', message);
    } finally {
      // The spinner belongs to this request, not to the session: a discarded
      // request must still release it, otherwise the next open renders
      // `creating: true` for a request that is already gone. A newer request
      // (if the user opened again and pressed create) owns the flag by now.
      if (isLatestRequest()) setCreating(false);
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

  // Keep the sheet in-tree to avoid Android Fabric native Dialog freezes. The
  // floating tab dock is suppressed by the caller (overlay owner / Settings),
  // not here: an effect would hide it one frame late and double-suppress when
  // the start popup and this form share an owner.
  if (!visible) return null;

  return (
    <View style={styles.overlayHost} pointerEvents="box-none">
      <Animated.View style={[styles.backdropLayer, { opacity: backdropProgress }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng tạo nhóm"
          // Stays operable while creating: the guarded close asks first.
          onPress={requestClose}
          style={({ pressed }) => [
            styles.backdrop,
            pressed ? styles.backdropPressed : null,
          ]}
        />
      </Animated.View>
      <KeyboardAvoidingView
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}>
        <Pressable style={styles.sheetPressGuard} onPress={() => undefined}>
          <Animated.View
            style={[styles.sheet, panelTransform]}
            onLayout={(e) => handlePanelLayout(e.nativeEvent.layout.height)}>
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
                android_ripple={{ color: koolaColors.line, borderless: true }}
                onPress={requestClose}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed ? styles.pressed : null,
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
          </Animated.View>
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
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
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
    borderRadius: koolaRadii.pill,
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
    borderRadius: koolaRadii.pill,
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
});

export default GroupCreateModal;
