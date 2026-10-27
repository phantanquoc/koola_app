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
  useMemo,
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
  FlatList,
  Alert,
  Image,
} from 'react-native';
import Video from 'react-native-video';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { ChatTabStackParamList } from '../../navigation/types';
import { KoolaOverlay, KoolaText, koolaColors, koolaRadii, useTheme } from '../../ui';
import type { Palette } from '../../ui/theme';
import { storiesApi } from '../../services/moments/momentsApi';
import { momentsService } from '../../services/moments/momentsService';
import { postsApi } from '../../services/moments/postsApi';
import { useAuth } from '../../contexts/AuthContext';
import type { Story, ViewerEntry, MusicTrack } from '../../services/moments/momentsApi';
import { viewsApi } from '../../services/moments/momentsApi';
import { getOrDownload } from '../../services/media/mediaCacheService';

type NavProp = NativeStackNavigationProp<ChatTabStackParamList>;
type ViewerRouteProp = RouteProp<ChatTabStackParamList, 'MomentViewer'>;
type ViewerState = 'loading' | 'loaded' | 'paused' | 'error' | 'expired' | 'blocked';

const ALLOWED_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👏', '🔥'];
const IMAGE_DURATION_MS = 5000;
const VIEW_DEBOUNCE_MS = 1000;

const MomentViewerScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<ViewerRouteProp>();
  const insets = useSafeAreaInsets();
  // `startStoryId` doubles as a story id OR a post id: a shared post link
  // (koola://moments/post/<id>) lands here because MomentViewer is the only
  // registered route under the moments path. `authorId` is optional so the
  // share target does not have to embed it.
  const { authorId: routeAuthorId, startStoryId } = route.params;
  // Shared post links carry no author — the story player is never rendered for
  // them, so the author falls back to '' (only used by story-only paths).
  const authorId = routeAuthorId ?? '';
  // Set when the id resolved to a POST rather than a story.
  const [savedPost, setSavedPost] = useState<{ id: string } | null>(null);
  const { user } = useAuth();
  const { palette } = useTheme();
  const modalStyles = useMemo(() => makeModalStyles(palette), [palette]);

  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewerState, setViewerState] = useState<ViewerState>(
    // A post link (no author) resolves through the post API instead of the story
    // API; starting at 'loaded' keeps the story player from painting one empty
    // frame ("Text strings must be rendered within a <Text>") on the way in.
    route.params.authorId ? 'loading' : 'loaded',
  );
  const [isPaused, setIsPaused] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<ViewerEntry[]>([]);
  const [toastMsg, setToastMsg] = useState('');
  const [trackInfo, setTrackInfo] = useState<MusicTrack | null>(null);
  const [resolvedMediaUri, setResolvedMediaUri] = useState<string | null>(null);
  // Resolved music audio URI for compose-at-playback. Prefers cached file://
  // via currentStory.musicKey; falls back to trackInfo.audioUrl when cold/absent.
  const [resolvedAudioUri, setResolvedAudioUri] = useState<string | null>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewRecordedRef = useRef(new Set<string>());
  const viewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedValueRef = useRef(0);
  const audioRef = useRef<React.ElementRef<typeof Video> | null>(null);
  // Post links carry no author, so this is only meaningful on the story path.
  const isOwnStory = routeAuthorId != null && user?._id === routeAuthorId;

  const currentStory = stories[currentIndex];

  const currentIndexRef = useRef(0);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
/* VIEWER_EFFECTS_PLACEHOLDER */

  // --- Fetch music track info for current story ---
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

  // --- Resolve music audio through persistent cache when musicKey is present ---
  // Prefers cached file:// so repeated story views play offline from disk.
  // Falls back to trackInfo.audioUrl when musicKey is absent (legacy) or cache fails.
  useEffect(() => {
    if (!currentStory?.musicRef) {
      setResolvedAudioUri(null);
      return;
    }

    const fallback = trackInfo?.audioUrl ?? null;

    // No musicKey → use the presigned track audio URL directly (backward compat)
    if (!currentStory.musicKey) {
      setResolvedAudioUri(fallback);
      return;
    }

    let cancelled = false;
    getOrDownload(currentStory.musicKey)
      .then((uri) => {
        if (cancelled) return;
        setResolvedAudioUri(uri ?? fallback);
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedAudioUri(fallback);
      });

    return () => { cancelled = true; };
  }, [currentStory?._id, currentStory?.musicRef, currentStory?.musicKey, trackInfo?.audioUrl]);

  // --- Resolve story media via persistent cache when mediaKey is present ---
  // Falls back to presigned mediaUrl when mediaKey is absent (legacy stories).
  useEffect(() => {
    if (!currentStory) {
      setResolvedMediaUri(null);
      return;
    }

    // No mediaKey → use presigned URL directly (backward compat)
    if (!currentStory.mediaKey) {
      setResolvedMediaUri(currentStory.mediaUrl ?? null);
      return;
    }

    let cancelled = false;
    // Try the persistent cache first; on miss download+caches and returns file://
    getOrDownload(currentStory.mediaKey)
      .then((uri) => {
        if (cancelled) return;
        setResolvedMediaUri(uri ?? currentStory.mediaUrl ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        // Download failed — fall back to presigned URL so playback still works
        setResolvedMediaUri(currentStory.mediaUrl ?? null);
      });

    return () => { cancelled = true; };
  }, [currentStory?._id, currentStory?.mediaKey, currentStory?.mediaUrl]);

  // --- Load the target id: a story (ring tap) or a post (shared link) ---
  //
  // THE TARGET IS THE ROUTE PARAM, never a React prop captured across
  // renders. A shared post link lands on this SAME mounted screen instance
  // (`?`/singleTask: the app is already running, Android re-delivers the URI
  // to the existing navigator), which pushes MomentViewer with new params
  // while the old instance keeps rendering. Every effect below therefore
  // depends on `routeAuthorId` / `startStoryId` and nothing derived.
  useEffect(() => {
    let cancelled = false;
    if (!routeAuthorId) {
      // Reached from a shared POST link: a post id can never be a story id,
      // so skip the story lookup entirely (it would surface a misleading
      // error). A re-targeted route (post A → post B) must not keep A's
      // "saved" screen visible while B loads.
      setSavedPost(null);
      setViewerState('loaded');
      postsApi.getPostById(startStoryId).then(
        (post) => {
          if (cancelled) return;
          const postId = post.id ?? post._id;
          if (!postId) {
            setViewerState('error');
            return;
          }
          // Cache it so the Moments feed can render it without a refetch.
          momentsService.cachePost({ ...post, id: postId });
          setSavedPost({ id: postId });
          setStories([]);
          setCurrentIndex(0);
          setViewerState('loaded');
        },
        () => {
          if (!cancelled) setViewerState('error');
        },
      );
      return () => {
        cancelled = true;
      };
    }

    // Story target (ring tap or `moments/story/<id>?authorId=`), author known.
    setSavedPost(null);
    setViewerState('loading');
    // Read here, not above: on a re-target this is the NEW story, and it is
    // deliberately not a dependency (getStoriesForAuthor builds a new array
    // per call, which would re-run this effect on every render).
    const cached = momentsService.getStoriesForAuthor(routeAuthorId);
    const startIdx = cached.findIndex((s) => s._id === startStoryId);
    if (cached.length > 0) {
      setStories(cached);
      setCurrentIndex(startIdx >= 0 ? startIdx : 0);
    }
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
        setCurrentIndex((prev) => (cached.length === 0 ? 0 : prev));
        setViewerState('loading');
      })
      .catch((err: { response?: { status?: number } } | undefined) => {
        if (cancelled) return;
        if (err?.response?.status === 410) setViewerState('expired');
        else if (err?.response?.status === 403) setViewerState('blocked');
        else setViewerState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [routeAuthorId, startStoryId]);
/* VIEWER_PROGRESS_PLACEHOLDER */

  // --- Progress animation ---
  const startProgress = useCallback(
    (durationMs: number, fromValue = 0) => {
      progressAnim.setValue(fromValue);
      const remainingMs = Math.max(0, durationMs * (1 - fromValue));
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: remainingMs,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) advanceStoryRef.current();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progressAnim],
  );

  const stopProgress = useCallback(() => {
    progressAnim.stopAnimation((value: number) => {
      pausedValueRef.current = value;
    });
  }, [progressAnim]);

  const advanceStory = useCallback(() => {
    const next = currentIndexRef.current + 1;
    if (next < stories.length) {
      setViewerState('loading');
      setCurrentIndex(next);
    } else {
      navigation.goBack();
    }
  }, [stories.length, navigation]);

  const goToPrevious = useCallback(() => {
    const prev = currentIndexRef.current - 1;
    if (prev >= 0) {
      setViewerState('loading');
      setCurrentIndex(prev);
    }
  }, []);

  const advanceStoryRef = useRef(advanceStory);
  useEffect(() => {
    advanceStoryRef.current = advanceStory;
  }, [advanceStory]);

  // --- View recording ---
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
/* VIEWER_SWIPE_PLACEHOLDER */

  // --- Swipe-down dismiss ---
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

  // --- On media load ---
  const handleMediaLoad = useCallback(() => {
    setViewerState('loaded');
    if (currentStory) {
      recordViewDebounced(currentStory._id);
      pausedValueRef.current = 0;
      const isVideo = currentStory.mediaType === 'video';
      if (!isVideo) {
        startProgress(IMAGE_DURATION_MS);
      }
    }
  }, [currentStory, recordViewDebounced, startProgress]);

  const handleVideoEnd = useCallback(() => {
    advanceStory();
  }, [advanceStory]);

  // --- Reactions ---
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
      }
    },
    [currentStory, authorId],
  );

  const lastTapRef = useRef(0);
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleReaction('❤️');
    }
    lastTapRef.current = now;
  }, [handleReaction]);

  // --- Comment ---
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
/* VIEWER_VIEWERSSHEET_PLACEHOLDER */

  // --- Viewers sheet (author only) ---
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

  // --- Pause on hold ---
  const handlePressIn = useCallback(() => {
    setIsPaused(true);
    stopProgress();
  }, [stopProgress]);

  const handlePressOut = useCallback(() => {
    setIsPaused(false);
    if (currentStory?.mediaType === 'image' && viewerState === 'loaded') {
      startProgress(IMAGE_DURATION_MS, pausedValueRef.current);
    }
  }, [currentStory, viewerState, startProgress]);

  // --- Mention rendering ---
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

  /**
   * Leave this screen even when there is nothing below it. A cold-start deep
   * link has no previous screen, and `goBack()` there is a no-op that traps
   * the user on an error/loading screen. `navigate('ChatHome')` targets the
   * ChatTab stack, so it lands on the feed from any tab.
   */
  const exitViewer = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('ChatHome');
  }, [navigation]);
/* VIEWER_RENDER_PLACEHOLDER */

  // --- Special states ---
  const renderSpecialState = (icon: string, message: string) => (
    <View style={[styles.container, styles.centerContent, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <MaterialIcons name={icon} size={48} color={koolaColors.faint} />
      <KoolaText tone="surface" align="center" variant="body" style={{ marginTop: 16 }}>
        {message}
      </KoolaText>
      <TouchableOpacity
        onPress={exitViewer}
        style={[styles.dismissButton, { marginTop: 16 }]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Quay lại">
        <KoolaText tone="primary">Quay lại</KoolaText>
      </TouchableOpacity>
    </View>
  );

  if (viewerState === 'expired') {
    return renderSpecialState('schedule', 'Khoảnh khắc không còn khả dụng');
  }
  if (viewerState === 'blocked') {
    return renderSpecialState('lock-outline', 'Bạn không có quyền xem khoảnh khắc này');
  }
  if (viewerState === 'error') {
    return renderSpecialState(
      'error-outline',
      routeAuthorId
        ? 'Đã xảy ra lỗi khi tải khoảnh khắc'
        : 'Không mở được bài viết này',
    );
  }
  // Reached from a shared post link (koola://moments/post/<id>): the post is a
  // feed card, not a story, so the story player must never render for it — not
  // even while the post fetch is in flight (stories is empty then, and the
  // player would paint an empty frame). The link flow ends here, always.
  if (!routeAuthorId) {
    // A post is a feed card, not a story: the story player must never render
    // for it — not even while the fetch is in flight (stories is empty then and
    // the player would paint an empty frame). The link flow ends here.
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        {savedPost ? (
          <>
            <MaterialIcons name="photo-library" size={48} color={koolaColors.faint} />
            <KoolaText tone="surface" align="center" variant="body" style={{ marginTop: 16 }}>
              Bài viết đã được lưu. Mở tab Khoảnh khắc để xem.
            </KoolaText>
            <TouchableOpacity
              // Open the feed ON THIS post instead of asking the user to hunt.
              onPress={exitViewer}
              style={[styles.dismissButton, { marginTop: 16 }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Mở bảng tin">
              <KoolaText tone="primary">Xem trong bảng tin</KoolaText>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator color={koolaColors.primary} accessibilityLabel="Đang tải" />
        )}
        {/* Always escapable: a cold-start link has no screen to go back to, so
            a fetch that never settles must still leave a way out. */}
        <TouchableOpacity
          onPress={exitViewer}
          style={{ marginTop: 24 }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
      {/* Progress bars — polished: 3px rounded */}
      <View style={[styles.progressContainer, { top: insets.top + 8 }]}>
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

      {/* Close button — proper icon with hitSlop */}
      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 16 }]}
        onPress={exitViewer}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Đóng xem khoảnh khắc">
        <MaterialIcons name="close" size={24} color="#FFFFFF" />
      </TouchableOpacity>
/* VIEWER_MEDIA_PLACEHOLDER */

      {/* Media */}
      {currentStory?.mediaType === 'video' ? (
        <Video
          source={{ uri: resolvedMediaUri ?? '' }}
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
      ) : currentStory && resolvedMediaUri ? (
        <Image
          source={{ uri: resolvedMediaUri }}
          style={styles.media}
          resizeMode="cover"
          onLoad={handleMediaLoad}
          onError={() => setViewerState('error')}
          accessibilityLabel="Ảnh khoảnh khắc"
        />
      ) : currentStory ? (
        // mediaKey present but neither the cache nor a presigned URL produced
        // a source — leaving this branch empty painted a blank black screen.
        <View style={styles.loadingOverlay} accessibilityLabel="Không tải được ảnh">
          <MaterialIcons name="broken-image" size={44} color="#FFFFFF" />
        </View>
      ) : null}

      {/* Parallel audio player (compose-at-playback). Hidden, audio-only. */}
      {currentStory?.musicRef && resolvedAudioUri ? (
        <Video
          key={`audio-${currentStory._id}`}
          ref={audioRef}
          source={{ uri: resolvedAudioUri }}
          style={styles.hiddenAudio}
          paused={isPaused || viewerState !== 'loaded'}
          muted={false}
          repeat
          playInBackground={false}
          onLoad={() => {
            const startMs = currentStory.musicRef?.startMs ?? 0;
            if (startMs > 0 && audioRef.current) {
              audioRef.current.seek(startMs / 1000);
            }
          }}
          onError={() => {}}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}

      {/* Loading spinner */}
      {(viewerState === 'loading') && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={koolaColors.surface} accessibilityLabel="Đang tải" />
        </View>
      )}

      {/* Accessibility live region */}
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
/* VIEWER_TAPZONES_PLACEHOLDER */

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
      {currentStory?.musicRef && trackInfo != null && (
        <View style={styles.musicPill} accessibilityLabel={`Nhạc: ${trackInfo.title} bởi ${trackInfo.artist}`}>
          <KoolaText variant="caption" tone="surface" numberOfLines={1}>
            🎵 {trackInfo.title} · {trackInfo.artist}
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

      {/* Viewers sheet — palette-aware. In-tree overlay, NOT a native <Modal>:
          the Dialog window is a separate Fabric surface; opening/closing it
          while this screen mounts/unmounts crashes with
          "Cannot remove child at index 0 … childCount may be incorrect". */}
      <KoolaOverlay
        visible={showViewers}
        onRequestClose={() => setShowViewers(false)}
        animate
        style={modalStyles.viewersModal}>
        <View style={modalStyles.viewersHeader}>
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
          removeClippedSubviews={false}
          data={viewers}
          keyExtractor={(item) => item.viewerId}
          renderItem={({ item }) => (
            <View
              style={modalStyles.viewerItem}
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
            <View style={modalStyles.viewersEmpty}>
              <KoolaText tone="muted" align="center">
                Chưa có ai xem khoảnh khắc này.
              </KoolaText>
            </View>
          }
        />
      </KoolaOverlay>
    </Animated.View>
  );
};
/* VIEWER_STYLES_PLACEHOLDER */

// --- Viewers Modal styles (palette-driven, normal surface) ---
const makeModalStyles = (palette: Palette) =>
  StyleSheet.create({
    viewersModal: {
      flex: 1,
      backgroundColor: palette.canvas,
    },
    viewersHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
      backgroundColor: palette.surface,
    },
    viewerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
    },
    viewersEmpty: {
      padding: 40,
    },
  });

// --- Static styles (intentionally dark for fullscreen media overlay) ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.ink,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: {
    ...StyleSheet.absoluteFillObject,
  },
  hiddenAudio: {
    width: 0,
    height: 0,
    position: 'absolute',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
/* VIEWER_STYLES_PART2 */
  progressContainer: {
    position: 'absolute',
    left: 8,
    right: 8,
    flexDirection: 'row',
    zIndex: 10,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 1.5,
    overflow: 'hidden',
    marginHorizontal: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 1.5,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: koolaRadii.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
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
/* VIEWER_STYLES_PART3 */
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
    zIndex: 10,
  },
  reactionButton: {
    width: 36,
    height: 36,
    borderRadius: koolaRadii.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3,
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
  a11yAnnounce: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
  },
});

export default MomentViewerScreen;
