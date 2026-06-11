/**
 * MomentViewerScreen.tsx
 *
 * Full-screen story viewer. Features:
 * - Auto-advance: image 5s, video on onEnd
 * - Compose-at-playback: parallel audio player for musicRef
 * - Tap left/right edge to navigate, hold to pause
 * - Swipe down to dismiss
 * - Reaction bar, comment input, viewers sheet (author only)
 * - @mention rendering with tap-to-profile
 * - View recording on first frame (debounced 1s)
 * - States: loading / loaded / paused / error / expired / blocked
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  PanResponder,
  ActivityIndicator,
  Animated,
  Modal,
  FlatList,
  Alert,
  Image,
} from 'react-native';
import Video from 'react-native-video';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { ChatTabStackParamList } from '../../navigation/types';
import { KoolaText, koolaColors } from '../../ui';
import { storiesApi } from '../../services/moments/momentsApi';
import { momentsService } from '../../services/moments/momentsService';
import { useAuth } from '../../contexts/AuthContext';
import type { Story, ViewerEntry, MusicTrack } from '../../services/moments/momentsApi';
import { viewsApi } from '../../services/moments/momentsApi';

type NavProp = NativeStackNavigationProp<ChatTabStackParamList>;
type ViewerRouteProp = RouteProp<ChatTabStackParamList, 'MomentViewer'>;

type ViewerState = 'loading' | 'loaded' | 'paused' | 'error' | 'expired' | 'blocked';

const ALLOWED_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👏', '🔥'];
const IMAGE_DURATION_MS = 5000;
const VIEW_DEBOUNCE_MS = 1000;

const MomentViewerScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<ViewerRouteProp>();
  const { authorId, startStoryId } = route.params;
  const { user } = useAuth();

  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewerState, setViewerState] = useState<ViewerState>('loading');
  const [isPaused, setIsPaused] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<ViewerEntry[]>([]);
  const [toastMsg, setToastMsg] = useState('');
  const [trackInfo, setTrackInfo] = useState<MusicTrack | null>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewRecordedRef = useRef(new Set<string>());
  const viewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOwnStory = user?._id === authorId;

  const currentStory = stories[currentIndex];

  // ─── Fetch music track info for current story ─────────────────────────────

  useEffect(() => {
    if (!currentStory?.musicRef?.trackId) {
      setTrackInfo(null);
      return;
    }
    let cancelled = false;
    momentsService
      .getMusicTrackById(currentStory.musicRef.trackId)
      .then((t) => { if (!cancelled) setTrackInfo(t); })
      .catch(() => { if (!cancelled) setTrackInfo(null); });
    return () => { cancelled = true; };
  }, [currentStory?.musicRef?.trackId]);

  // ─── Load stories for author ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const cached = momentsService.getStoriesForAuthor(authorId);
    const startIdx = cached.findIndex((s) => s._id === startStoryId);

    // Show whatever we have from cache immediately, then resolve mediaUrl.
    if (cached.length > 0) {
      setStories(cached);
      setCurrentIndex(startIdx >= 0 ? startIdx : 0);
    }

    // Always fetch the start story detail to get a presigned mediaUrl.
    storiesApi
      .getStoryById(startStoryId)
      .then((detail) => {
        if (cancelled) return;
        setStories((prev) => {
          if (prev.length === 0) return [detail];
          const next = [...prev];
          const idx = next.findIndex((s) => s._id === detail._id);
          if (idx >= 0) next[idx] = { ...next[idx], ...detail };
          else next.unshift(detail);
          return next;
        });
        setCurrentIndex((prev) => {
          if (cached.length === 0) return 0;
          return prev;
        });
        setViewerState('loading');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 410) setViewerState('expired');
        else if (err?.response?.status === 403) setViewerState('blocked');
        else setViewerState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [authorId, startStoryId]);

  // ─── Progress animation ───────────────────────────────────────────────────

  const startProgress = useCallback(
    (durationMs: number) => {
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: durationMs,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) advanceStory();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progressAnim],
  );

  const stopProgress = useCallback(() => {
    progressAnim.stopAnimation();
  }, [progressAnim]);

  const advanceStory = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev + 1 < stories.length) {
        setViewerState('loading');
        return prev + 1;
      }
      // No more stories — dismiss
      navigation.goBack();
      return prev;
    });
  }, [stories.length, navigation]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev > 0) {
        setViewerState('loading');
        return prev - 1;
      }
      return prev;
    });
  }, []);

  // ─── View recording ───────────────────────────────────────────────────────

  const recordViewDebounced = useCallback((storyId: string) => {
    if (viewRecordedRef.current.has(storyId)) return;
    if (viewDebounceRef.current) clearTimeout(viewDebounceRef.current);
    viewDebounceRef.current = setTimeout(() => {
      if (!viewRecordedRef.current.has(storyId)) {
        viewRecordedRef.current.add(storyId);
        momentsService.recordView(storyId);
      }
    }, VIEW_DEBOUNCE_MS);
  }, []);

  // ─── Swipe-down dismiss ───────────────────────────────────────────────────

  const swipeY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 10,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) swipeY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) {
          navigation.goBack();
        } else {
          Animated.spring(swipeY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  // ─── On media load ────────────────────────────────────────────────────────

  const handleMediaLoad = useCallback(() => {
    setViewerState('loaded');
    if (currentStory) {
      recordViewDebounced(currentStory._id);
      const isVideo = currentStory.mediaType === 'video';
      if (!isVideo) {
        startProgress(IMAGE_DURATION_MS);
      }
    }
  }, [currentStory, recordViewDebounced, startProgress]);

  const handleVideoEnd = useCallback(() => {
    advanceStory();
  }, [advanceStory]);

  // ─── Reactions ────────────────────────────────────────────────────────────

  const handleReaction = useCallback(
    async (emoji: string) => {
      if (!currentStory) return;
      try {
        await momentsService.reactToStory(currentStory._id, authorId, emoji);
      } catch (err: any) {
        if (err?.response?.status === 410) {
          setViewerState('expired');
          return;
        }
        // Non-critical — swallow other errors
      }
    },
    [currentStory, authorId],
  );

  // Double-tap heart shortcut
  const lastTapRef = useRef(0);
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleReaction('❤️');
    }
    lastTapRef.current = now;
  }, [handleReaction]);

  // ─── Comment ──────────────────────────────────────────────────────────────

  const handleSendComment = useCallback(async () => {
    if (!currentStory || !commentText.trim()) return;
    try {
      await momentsService.commentOnStory(currentStory._id, commentText.trim());
      setCommentText('');
      setShowComment(false);
      setToastMsg(`Đã gửi tin nhắn cho ${authorId}`);
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err: any) {
      if (err?.response?.status === 410) {
        setViewerState('expired');
        return;
      }
      Alert.alert('Lỗi', 'Không gửi được tin nhắn. Vui lòng thử lại.');
    }
  }, [currentStory, commentText, authorId]);

  // ─── Viewers sheet (author only) ──────────────────────────────────────────

  const handleSwipeUp = useCallback(async () => {
    if (!isOwnStory || !currentStory) return;
    try {
      const { viewers: v } = await viewsApi.listViewers(currentStory._id);
      setViewers(v);
      setShowViewers(true);
    } catch {
      Alert.alert('Lỗi', 'Không tải được danh sách người xem.');
    }
  }, [isOwnStory, currentStory]);

  // ─── Pause on hold ────────────────────────────────────────────────────────

  const handlePressIn = useCallback(() => {
    setIsPaused(true);
    stopProgress();
  }, [stopProgress]);

  const handlePressOut = useCallback(() => {
    setIsPaused(false);
    if (currentStory?.mediaType === 'image' && viewerState === 'loaded') {
      startProgress(IMAGE_DURATION_MS);
    }
  }, [currentStory, viewerState, startProgress]);

  // ─── Mention rendering ────────────────────────────────────────────────────

  const renderCaption = useCallback((story: Story) => {
    if (!story.caption || story.mentions.length === 0) {
      return (
        <KoolaText style={styles.captionText} tone="surface">
          {story.caption}
        </KoolaText>
      );
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const sortedMentions = [...story.mentions].sort((a, b) => a.offset - b.offset);

    for (const mention of sortedMentions) {
      if (mention.offset > lastIndex) {
        parts.push(
          <KoolaText key={`text-${lastIndex}`} style={styles.captionText} tone="surface">
            {story.caption.slice(lastIndex, mention.offset)}
          </KoolaText>,
        );
      }
      parts.push(
        <TouchableOpacity
          key={`mention-${mention.userId}`}
          onPress={() => navigation.push('Profile', { userId: mention.userId })}
          accessibilityRole="link"
          accessibilityLabel={`Xem hồ sơ ${mention.username}`}>
          <KoolaText style={[styles.captionText, styles.mentionText]}>
            @{mention.username}
          </KoolaText>
        </TouchableOpacity>,
      );
      lastIndex = mention.offset + mention.length;
    }

    if (lastIndex < story.caption.length) {
      parts.push(
        <KoolaText key={`text-end`} style={styles.captionText} tone="surface">
          {story.caption.slice(lastIndex)}
        </KoolaText>,
      );
    }

    return <View style={styles.captionRow}>{parts}</View>;
  }, [navigation]);

  // ─── Special states ───────────────────────────────────────────────────────

  if (viewerState === 'expired') {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <KoolaText tone="surface" align="center" variant="body">
          Khoảnh khắc không còn khả dụng
        </KoolaText>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.dismissButton}
          accessibilityRole="button"
          accessibilityLabel="Quay lại">
          <KoolaText tone="primary">Quay lại</KoolaText>
        </TouchableOpacity>
      </View>
    );
  }

  if (viewerState === 'blocked') {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <KoolaText tone="surface" align="center" variant="body">
          Bạn không có quyền xem khoảnh khắc này
        </KoolaText>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.dismissButton}
          accessibilityRole="button"
          accessibilityLabel="Quay lại">
          <KoolaText tone="primary">Quay lại</KoolaText>
        </TouchableOpacity>
      </View>
    );
  }

  if (viewerState === 'error') {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <KoolaText tone="surface" align="center">
          Đã xảy ra lỗi khi tải khoảnh khắc
        </KoolaText>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.dismissButton}
          accessibilityRole="button"
          accessibilityLabel="Quay lại">
          <KoolaText tone="primary">Quay lại</KoolaText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: swipeY }] }]}
      {...panResponder.panHandlers}
      accessibilityLabel={
        currentStory
          ? `Khoảnh khắc của ${authorId}, ${currentStory.caption || ''}, ${currentStory.viewCount} lượt xem`
          : 'Khoảnh khắc'
      }
      accessibilityRole="image">
      {/* Progress bars */}
      <View style={styles.progressContainer}>
        {stories.map((s, i) => (
          <View key={s._id} style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: i < currentIndex
                    ? '100%'
                    : i === currentIndex
                    ? progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                    : '0%',
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Close button */}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Đóng xem khoảnh khắc">
        <KoolaText style={styles.closeIcon} tone="surface">
          ✕
        </KoolaText>
      </TouchableOpacity>

      {/* Media */}
      {currentStory?.mediaType === 'video' ? (
        <Video
          source={{ uri: currentStory.mediaUrl ?? '' }}
          style={styles.media}
          resizeMode="cover"
          paused={isPaused}
          muted={!!currentStory.musicRef}
          onLoad={handleMediaLoad}
          onEnd={handleVideoEnd}
          onError={() => setViewerState('error')}
          repeat={false}
          accessibilityLabel="Video khoảnh khắc"
        />
      ) : currentStory?.mediaUrl ? (
        <Image
          source={{ uri: currentStory.mediaUrl }}
          style={styles.media}
          resizeMode="cover"
          onLoad={handleMediaLoad}
          onError={() => setViewerState('error')}
          accessibilityLabel="Ảnh khoảnh khắc"
        />
      ) : null}

      {/* Loading spinner */}
      {(viewerState === 'loading') && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={koolaColors.surface} accessibilityLabel="Đang tải" />
        </View>
      )}

      {/* Accessibility live region — announces story change for screen readers (21.4) */}
      <View
        style={styles.a11yAnnounce}
        accessibilityLiveRegion="polite"
        importantForAccessibility="yes"
        accessible
        accessibilityLabel={
          currentStory
            ? `Khoảnh khắc ${currentIndex + 1} / ${stories.length}. Tác giả: ${authorId}. ${currentStory.caption ? `Chú thích: ${currentStory.caption.slice(0, 80)}` : ''}`
            : undefined
        }
      />

      {/* Tap zones for navigation (left / right) */}
      <View style={styles.tapZones} pointerEvents="box-none">
        <TouchableWithoutFeedback
          onPress={goToPrevious}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityRole="button"
          accessibilityLabel="Khoảnh khắc trước">
          <View style={styles.tapLeft} />
        </TouchableWithoutFeedback>
        <TouchableWithoutFeedback
          onPress={handleDoubleTap}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityRole="button"
          accessibilityLabel="Nhấn đúp để thả tim">
          <View style={styles.tapRight} />
        </TouchableWithoutFeedback>
      </View>

      {/* Caption */}
      {currentStory?.caption ? (
        <View style={styles.captionContainer}>
          {renderCaption(currentStory)}
        </View>
      ) : null}

      {/* Music attribution pill */}
      {currentStory?.musicRef && trackInfo && (
        <View style={styles.musicPill} accessibilityLabel={`Nhạc: ${trackInfo.title} bởi ${trackInfo.artist}`}>
          <KoolaText variant="caption" tone="surface" numberOfLines={1}>
            {trackInfo.title} · {trackInfo.artist}
          </KoolaText>
        </View>
      )}

      {/* Reaction bar */}
      {!isOwnStory && (
        <View style={styles.reactionBar} accessibilityLabel="Phản ứng với khoảnh khắc">
          {ALLOWED_REACTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => handleReaction(emoji)}
              style={[
                styles.reactionButton,
                currentStory?.myReaction === emoji && styles.reactionSelected,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Phản ứng ${emoji}`}>
              <KoolaText style={styles.reactionEmoji}>{emoji}</KoolaText>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Comment input */}
      {!isOwnStory && !showComment && (
        <TouchableOpacity
          style={styles.commentEntryRow}
          onPress={() => setShowComment(true)}
          accessibilityRole="button"
          accessibilityLabel="Gửi tin nhắn về khoảnh khắc này">
          <KoolaText tone="surface" style={styles.commentPlaceholder}>
            Gửi tin nhắn...
          </KoolaText>
        </TouchableOpacity>
      )}
      {!isOwnStory && showComment && (
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Nhập tin nhắn..."
            placeholderTextColor={koolaColors.faint}
            returnKeyType="send"
            onSubmitEditing={handleSendComment}
            autoFocus
            accessibilityLabel="Nhập tin nhắn trả lời khoảnh khắc"
          />
          <TouchableOpacity
            onPress={handleSendComment}
            style={styles.sendButton}
            accessibilityRole="button"
            accessibilityLabel="Gửi">
            <KoolaText tone="primary" weight="700">Gửi</KoolaText>
          </TouchableOpacity>
        </View>
      )}

      {/* Author — swipe-up for viewers */}
      {isOwnStory && currentStory && (
        <TouchableOpacity
          style={styles.viewersEntry}
          onPress={handleSwipeUp}
          accessibilityRole="button"
          accessibilityLabel={`Đã xem ${currentStory.viewCount} lượt`}>
          <KoolaText tone="surface">Đã xem ({currentStory.viewCount})</KoolaText>
        </TouchableOpacity>
      )}

      {/* Toast */}
      {toastMsg ? (
        <View style={styles.toast} accessibilityLiveRegion="polite">
          <KoolaText tone="surface">{toastMsg}</KoolaText>
        </View>
      ) : null}

      {/* Viewers sheet */}
      <Modal
        visible={showViewers}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowViewers(false)}>
        <View style={styles.viewersModal} accessibilityViewIsModal>
          <View style={styles.viewersHeader}>
            <KoolaText variant="label" weight="700">
              Người đã xem
            </KoolaText>
            <TouchableOpacity
              onPress={() => setShowViewers(false)}
              accessibilityRole="button"
              accessibilityLabel="Đóng">
              <KoolaText tone="primary">Đóng</KoolaText>
            </TouchableOpacity>
          </View>
          <FlatList
            data={viewers}
            keyExtractor={(item) => item.viewerId}
            renderItem={({ item }) => (
              <View
                style={styles.viewerItem}
                accessibilityLabel={`${item.displayName} đã xem`}>
                <KoolaText variant="body" tone="ink">
                  {item.displayName}
                </KoolaText>
                <KoolaText variant="caption" tone="muted">
                  {new Date(item.viewedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </KoolaText>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.viewersEmpty}>
                <KoolaText tone="muted" align="center">
                  Chưa có ai xem khoảnh khắc này.
                </KoolaText>
              </View>
            }
          />
        </View>
      </Modal>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.ink,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  media: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    position: 'absolute',
    top: 48,
    left: 8,
    right: 8,
    flexDirection: 'row',
    gap: 4,
    zIndex: 10,
  },
  progressTrack: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: koolaColors.surface,
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 16,
    zIndex: 20,
    padding: 8,
  },
  closeIcon: {
    fontSize: 20,
    fontWeight: '700',
  },
  tapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 5,
  },
  tapLeft: {
    flex: 1,
  },
  tapRight: {
    flex: 2,
  },
  captionContainer: {
    position: 'absolute',
    bottom: 140,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  captionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  captionText: {
    fontSize: 15,
    lineHeight: 22,
    color: koolaColors.surface,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  mentionText: {
    color: koolaColors.primarySoft,
    fontWeight: '700',
  },
  musicPill: {
    position: 'absolute',
    bottom: 170,
    left: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '70%',
  },
  reactionBar: {
    position: 'absolute',
    bottom: 90,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    zIndex: 10,
  },
  reactionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionSelected: {
    backgroundColor: koolaColors.primary,
  },
  reactionEmoji: {
    fontSize: 18,
  },
  commentEntryRow: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 10,
  },
  commentPlaceholder: {
    opacity: 0.7,
  },
  commentInputRow: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    zIndex: 20,
  },
  commentInput: {
    flex: 1,
    color: koolaColors.surface,
    fontSize: 15,
    paddingVertical: 4,
  },
  sendButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  viewersEntry: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  toast: {
    position: 'absolute',
    bottom: 80,
    left: 40,
    right: 40,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    zIndex: 30,
  },
  dismissButton: {
    marginTop: 16,
    padding: 12,
  },
  viewersModal: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },
  viewersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
    backgroundColor: koolaColors.surface,
  },
  viewerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  viewersEmpty: {
    padding: 40,
  },
  // Zero-size view used exclusively for screen reader live region announcements (21.4)
  a11yAnnounce: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
  },
});

export default MomentViewerScreen;
