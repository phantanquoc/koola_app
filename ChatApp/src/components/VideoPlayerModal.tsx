import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Video, {
  VideoRef,
  OnProgressData,
  OnLoadData,
  OnBufferData,
  OnVideoErrorData,
  ViewType,
} from 'react-native-video';
import Slider from '@react-native-community/slider';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { getOrDownload, getFromMemory, invalidateKey } from '../services/media/mediaCacheService';
import apiClient from '../services/api/apiService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  visible: boolean;
  uri: string;
  onClose: () => void;
}

/**
 * Fullscreen video player rendered as an absolutely-positioned overlay in the
 * same Activity window (NOT a RN `<Modal>`).
 *
 * Why no `<Modal>`: on Android, `<Modal>` is backed by a native `Dialog` with
 * its own `Window`. react-native-video v6 + media3 (androidx.media3:1.x) holds
 * a `SurfaceView` inside that dialog window. When the dialog is dismissed,
 * media3 can paint one final frame into the wrong window (the main activity's
 * decor view), producing a small floating rectangle in the top-left corner
 * that survives until the Activity is recreated.
 *
 * Rendering the player inside the main window removes the second window
 * entirely, so there is nowhere for a stale surface to land.
 */
const VideoPlayerModal: React.FC<Props> = ({ visible, uri, onClose }) => {
  const videoRef = useRef<VideoRef>(null);
  const [videoKey, setVideoKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolveAttempt, setResolveAttempt] = useState(0);
  // True when current playback source is a presigned streaming URL (progressive
  // mode) rather than a cached/downloaded file:// URI. Used to decide on playback
  // error whether to fall back to full-download (stream failed) vs show error UI.
  const isStreamingRef = useRef(false);
  // Separate "should mount <Video>" flag so we can unmount it BEFORE the
  // overlay itself disappears, giving media3 a frame to release the surface
  // while the black background still covers any leftover pixels.
  const [mountVideo, setMountVideo] = useState(false);

  // Resolve URI when overlay opens — progressive playback strategy:
  //   1. Check cache synchronously (getFromMemory). Hit → mount <Video> on file:// instantly.
  //   2. Cache miss → fetch presigned GET URL via REST, mount <Video> for streaming immediately,
  //      AND fire-and-forget getOrDownload() to warm the cache for next open.
  //   3. If presigned-stream fails (onError), fall back to full-download-then-play by bumping
  //      resolveAttempt which re-runs this effect in "full download" mode.
  // Passthrough: if uri is already http(s) or file://, use it directly (existing behavior).
  useEffect(() => {
    if (!visible || !uri) {
      setResolvedUri(null);
      setLoading(false);
      return;
    }
    setPaused(false);
    setCurrentTime(0);
    setDuration(0);
    setHasError(false);
    setLoading(true);
    setMountVideo(false);
    setVideoKey((k) => k + 1);

    // Already an absolute URI (http/file) — pass through unchanged.
    if (uri.startsWith('http') || uri.startsWith('file://')) {
      isStreamingRef.current = false;
      setResolvedUri(uri);
      setMountVideo(true);
      setLoading(false);
      return;
    }

    // Mode selection: first attempt = progressive (stream-first); retry = full download fallback.
    const progressiveMode = resolveAttempt === 0;

    let cancelled = false;

    (async () => {
      // Fast path: cache hit → instant file:// playback
      const cached = getFromMemory(uri);
      if (cached) {
        if (cancelled) return;
        isStreamingRef.current = false;
        setResolvedUri(cached);
        setMountVideo(true);
        setLoading(false);
        // Still warm cache in background (no-op if already present, but ensures index entry exists)
        getOrDownload(uri).catch(() => {/* best-effort */});
        return;
      }

      if (!progressiveMode) {
        // Full-download fallback mode (after stream error)
        try {
          const localUri = await getOrDownload(uri);
          if (cancelled) return;
          isStreamingRef.current = false;
          if (localUri) {
            setResolvedUri(localUri);
            setMountVideo(true);
          } else {
            setHasError(true);
          }
          setLoading(false);
        } catch {
          if (!cancelled) {
            setHasError(true);
            setLoading(false);
          }
        }
        return;
      }

      // Progressive mode: fetch presigned URL and start streaming immediately
      try {
        const { data } = await apiClient.get<{ url: string; expiresAt: string }>(
          `/media/${encodeURIComponent(uri)}`,
        );
        if (cancelled) return;
        if (data?.url) {
          isStreamingRef.current = true;
          setResolvedUri(data.url);
          setMountVideo(true);
          setLoading(false);
          // Fire-and-forget: warm cache so next open is instant from disk
          getOrDownload(uri).catch(() => {/* best-effort warm */});
        } else {
          // No URL returned — fall back to full download
          const localUri = await getOrDownload(uri);
          if (cancelled) return;
          isStreamingRef.current = false;
          if (localUri) {
            setResolvedUri(localUri);
            setMountVideo(true);
          } else {
            setHasError(true);
          }
          setLoading(false);
        }
      } catch {
        if (cancelled) return;
        // Presigned URL fetch failed — fall back to full download
        try {
          const localUri = await getOrDownload(uri);
          if (cancelled) return;
          isStreamingRef.current = false;
          if (localUri) {
            setResolvedUri(localUri);
            setMountVideo(true);
          } else {
            setHasError(true);
          }
          setLoading(false);
        } catch {
          if (!cancelled) {
            setHasError(true);
            setLoading(false);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, uri, resolveAttempt]);

  const handleClose = useCallback(() => {
    // Phase 1: pause the player so media3 commits a paused state.
    setPaused(true);
    // Phase 2: unmount <Video> on the next frame. The black overlay is still
    // covering the area, so any leftover surface frame is hidden.
    requestAnimationFrame(() => {
      setMountVideo(false);
      setResolvedUri(null);
      // Phase 3: one more frame, then dismiss the overlay itself.
      requestAnimationFrame(() => {
        setCurrentTime(0);
        setDuration(0);
        setBuffering(false);
        setHasError(false);
        setLoading(false);
        onClose();
      });
    });
  }, [onClose]);

  // Tear down on background / screen lock.
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        setPaused(true);
        setMountVideo(false);
        setResolvedUri(null);
      }
    });
    return () => sub.remove();
  }, [visible]);

  // Hardware back button on Android closes the overlay.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, handleClose]);

  const handleProgress = useCallback(
    ({ currentTime: ct }: OnProgressData) => {

      if (!isSeeking) {
        setCurrentTime(ct);
      }
    },
    [isSeeking],
  );

  const handleLoad = useCallback(({ duration: d }: OnLoadData) => {
    setDuration(d);
  }, []);

  const handleBuffer = useCallback(({ isBuffering }: OnBufferData) => {
    setBuffering(isBuffering);
  }, []);

  const handleError = useCallback((_err: OnVideoErrorData) => {
    console.warn('[VideoPlayerModal] Playback error:', _err?.error?.errorString || _err);

    // If we were streaming via presigned URL (progressive mode), the stream may
    // have failed — fall back to full-download-then-play by bumping resolveAttempt.
    // This re-runs the resolve effect with progressiveMode=false.
    if (isStreamingRef.current) {
      isStreamingRef.current = false;
      setMountVideo(false);
      setResolvedUri(null);
      setHasError(false);
      setLoading(true);
      setResolveAttempt((a) => a + 1);
      return;
    }

    // Not streaming — cached/downloaded file playback failed, likely corrupt.
    // Invalidate cached file and show error UI with retry.
    if (uri) {
      invalidateKey(uri);
    }
    setHasError(true);
  }, [uri]);

  const handleSeekStart = useCallback(() => {
    setIsSeeking(true);
  }, []);

  const handleSeekComplete = useCallback(
    (value: number) => {
      setIsSeeking(false);
      setCurrentTime(value);
      videoRef.current?.seek(value);
    },
    [],
  );

  const handleRetry = useCallback(() => {
    if (uri) {
      invalidateKey(uri);
    }
    setHasError(false);
    setLoading(true);
    setPaused(false);
    setMountVideo(false);
    setResolvedUri(null);
    setResolveAttempt((attempt) => attempt + 1);
  }, [uri]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!visible) return null;

  return (
    <View
      style={styles.overlayRoot}
      pointerEvents="auto"
      // Ensure this View gets a dedicated native view (not collapsed into a
      // parent) so the z-order is stable on Android.
      collapsable={false}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <MaterialIcons name="close" size={22} color="#fff" />
        </TouchableOpacity>

        {/* Video area — `overflow: hidden` clips any leftover surface frame
            to the player box so it cannot bleed into the corner. */}
        <View style={styles.videoContainer} collapsable={false}>
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}

          {hasError && (
            <View style={styles.errorOverlay}>
              <Text style={styles.errorText}>Không thể phát video</Text>
              <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                <Text style={styles.retryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          )}

          {mountVideo && !loading && !hasError && resolvedUri && (
            <Video
              ref={videoRef}
              key={videoKey}
              source={{
                uri: resolvedUri,
                // Progressive streaming buffer config: lower thresholds so playback
                // starts quickly from a presigned stream without waiting for a large
                // initial buffer. Only applied when streaming (not cached file://).
                ...(isStreamingRef.current ? {
                  bufferConfig: {
                    minBufferMs: 15000,
                    maxBufferMs: 50000,
                    bufferForPlaybackMs: 2500,
                    bufferForPlaybackAfterRebufferMs: 5000,
                  },
                } : {}),
              }}
              style={styles.video}
              paused={paused}
              muted={muted}
              controls={false}
              resizeMode="contain"
              playInBackground={false}
              playWhenInactive={false}
              ignoreSilentSwitch="ignore"
              enterPictureInPictureOnLeave={false}
              {...(Platform.OS === 'android' ? { viewType: ViewType.TEXTURE } : {})}
              onProgress={handleProgress}
              onLoad={handleLoad}
              onBuffer={handleBuffer}
              onError={handleError}
            />
          )}

          {buffering && !loading && (
            <View style={styles.bufferingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
        </View>

        {/* Controls */}
        {!hasError && (
          <View style={styles.controls}>
            <View style={styles.seekRow}>
              <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={duration || 1}
                value={currentTime}
                minimumTrackTintColor="#2196F3"
                maximumTrackTintColor="rgba(255,255,255,0.4)"
                thumbTintColor="#fff"
                onSlidingStart={handleSeekStart}
                onSlidingComplete={handleSeekComplete}
              />
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={() => setMuted((m) => !m)}
              >
                <MaterialIcons
                  name={muted ? 'volume-off' : 'volume-up'}
                  size={24}
                  color="#fff"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.playButton}
                onPress={() => setPaused((p) => !p)}
              >
                <MaterialIcons
                  name={paused ? 'play-arrow' : 'pause'}
                  size={32}
                  color="#fff"
                />
              </TouchableOpacity>

              <View style={styles.controlButton} />
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
    zIndex: 9999,
    elevation: 9999,
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  errorText: {
    color: '#ccc',
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#2196F3',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  controls: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  seekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  slider: {
    flex: 1,
    marginHorizontal: 8,
  },
  timeText: {
    color: '#fff',
    fontSize: 12,
    minWidth: 36,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  controlButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default VideoPlayerModal;
