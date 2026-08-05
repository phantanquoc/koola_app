import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Image, Text, StyleSheet, Dimensions, TouchableOpacity, Animated, Easing } from 'react-native';
import { Blurhash } from 'react-native-blurhash';
import { getOrDownload, getFromMemory } from '../services/media/mediaCacheService';
import { useTheme } from '../ui';
import type { SemanticTokens } from '../ui/tokens/semantic';
import { koolaDurations, koolaEasing, prefersReducedMotion } from '../ui/tokens/motion';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_MAX_WIDTH = SCREEN_WIDTH * 0.6;
const IMAGE_MAX_HEIGHT = 300;
const IMAGE_DEFAULT_HEIGHT = 200;

// Module-level dimension cache — persists across re-mounts so scrolling
// back to an image never causes a layout jump.
const dimensionCache = new Map<string, { w: number; h: number }>();

function computeDisplaySize(srcW: number, srcH: number) {
  const aspectRatio = srcW / srcH;
  let w = IMAGE_MAX_WIDTH;
  let h = w / aspectRatio;
  if (h > IMAGE_MAX_HEIGHT) {
    h = IMAGE_MAX_HEIGHT;
    w = h * aspectRatio;
  }
  return { width: Math.round(w), height: Math.round(h) };
}

interface Props {
  mediaKey?: string;
  isUploading?: boolean;
  uploadProgress?: number;
  blurhash?: string | null;
  imageWidth?: number;
  imageHeight?: number;
  onPress?: (uri: string) => void;
}

type ResolvedMedia = { key: string; uri: string } | null;

function resolveMediaSync(mediaKey?: string): ResolvedMedia {
  if (!mediaKey || mediaKey === 'media-pending') return null;
  const cached = getFromMemory(mediaKey);
  return cached ? { key: mediaKey, uri: cached } : null;
}

/**
 * Dimensions: backend props > module dimension cache > null (unknown).
 *
 * Deliberately a plain function, not a memo: the resolution effect needs to read
 * the *current* cache state without the value participating in its own re-run
 * condition. The effect writes `dimensionCache`, so a derived value in its
 * dependency list would let the effect re-enter itself.
 */
function readKnownDims(
  mediaKey: string | undefined,
  w?: number,
  h?: number,
): { w: number; h: number } | null {
  if (w && w > 0 && h && h > 0) return { w, h };
  if (mediaKey && dimensionCache.has(mediaKey)) return dimensionCache.get(mediaKey)!;
  return null;
}

const MediaImage: React.FC<Props> = ({ mediaKey, isUploading, uploadProgress, blurhash, imageWidth, imageHeight, onPress }) => {
  const activeMediaKey = mediaKey && mediaKey !== 'media-pending' ? mediaKey : '';
  const [resolvedMedia, setResolvedMedia] = useState<ResolvedMedia>(() =>
    resolveMediaSync(mediaKey),
  );
  // The key whose image is fully revealed (opacity settled at 1). A synchronous
  // memory-cache hit is revealed from the first committed frame — the file is
  // already on disk, so there is nothing to fade in and nothing to wait for.
  const [revealedKey, setRevealedKey] = useState<string | null>(() =>
    resolvedMedia?.key ?? null,
  );
  const uri = resolvedMedia?.key === activeMediaKey ? resolvedMedia.uri : null;
  const imageReady = revealedKey === activeMediaKey && !!uri;
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  // Dimensions this row discovered at runtime (also written to the module cache
  // so later mounts start with them). Held as state rather than derived from the
  // cache inside the resolution effect's dependencies — that derivation is what
  // previously let the effect retrigger itself.
  const [measuredDims, setMeasuredDims] = useState<{ key: string; w: number; h: number } | null>(null);
  const mountedRef = useRef(true);
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);

  // Opacity is animated outside React state so a fade costs no re-renders.
  // Seeded at 1 for a cache hit so the first paint is already opaque.
  const opacityRef = useRef<Animated.Value | null>(null);
  if (opacityRef.current === null) {
    opacityRef.current = new Animated.Value(revealedKey ? 1 : 0);
  }
  const opacity = opacityRef.current;
  const fadeRef = useRef<Animated.CompositeAnimation | null>(null);
  // Set when a URI had to be awaited: that image fades in once, starting when
  // the native view reports it has decoded.
  const pendingFadeKeyRef = useRef<string | null>(null);

  const knownDims = useMemo(() => {
    const fromProps = readKnownDims(mediaKey, imageWidth, imageHeight);
    if (fromProps) return fromProps;
    if (measuredDims && measuredDims.key === activeMediaKey) {
      return { w: measuredDims.w, h: measuredDims.h };
    }
    return null;
  }, [mediaKey, activeMediaKey, imageWidth, imageHeight, measuredDims]);

  // Display size: use known dims or fixed fallback (never changes mid-render)
  const displayDimensions = useMemo(() => {
    if (knownDims) return computeDisplaySize(knownDims.w, knownDims.h);
    return { width: IMAGE_MAX_WIDTH, height: IMAGE_DEFAULT_HEIGHT };
  }, [knownDims]);

  /**
   * Record freshly measured dimensions: into the module cache for later mounts,
   * and into local state so this row's container adopts the true aspect ratio.
   *
   * Crucially this does NOT feed the resolution effect's re-run condition, so
   * recording dimensions can no longer re-enter that effect.
   */
  const recordDims = useCallback((key: string, w: number, h: number) => {
    if (!(w > 0 && h > 0)) return;
    const existing = dimensionCache.get(key);
    if (!existing || existing.w !== w || existing.h !== h) {
      dimensionCache.set(key, { w, h });
    }
    setMeasuredDims((prev) =>
      prev && prev.key === key && prev.w === w && prev.h === h ? prev : { key, w, h },
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      fadeRef.current?.stop();
      fadeRef.current = null;
    };
  }, []);

  /** Reveal with no transition (cache hit, or reduce-motion enabled). */
  const revealNow = useCallback((key: string) => {
    fadeRef.current?.stop();
    fadeRef.current = null;
    opacity.setValue(1);
    setRevealedKey(key);
  }, [opacity]);

  /** Reveal a freshly downloaded image with a single 180ms decelerate fade. */
  const fadeIn = useCallback((key: string) => {
    if (prefersReducedMotion()) {
      revealNow(key);
      return;
    }
    fadeRef.current?.stop();
    opacity.setValue(0);
    const anim = Animated.timing(opacity, {
      toValue: 1,
      duration: koolaDurations.normal,
      easing: Easing.bezier(...koolaEasing.decelerate),
      useNativeDriver: true,
    });
    fadeRef.current = anim;
    anim.start(({ finished }) => {
      if (!finished || !mountedRef.current) return;
      fadeRef.current = null;
      // Drop the blurhash layer only once the image is fully opaque.
      setRevealedKey(key);
    });
  }, [opacity, revealNow]);

  useEffect(() => {
    if (!activeMediaKey) {
      setResolvedMedia(null);
      setRevealedKey(null);
      setError(false);
      opacity.setValue(0);
      return;
    }

    // ── Synchronous memory-cache hit ──────────────────────────────────────────
    // The state initialiser may already have resolved this key. Writing an
    // equivalent value again would commit a second, identical render for every
    // cached row, so hold the existing object when the URI is unchanged.
    const cached = retryCount === 0 ? getFromMemory(activeMediaKey) : null;
    if (cached) {
      setError(false);
      setResolvedMedia((prev) =>
        prev && prev.key === activeMediaKey && prev.uri === cached
          ? prev
          : { key: activeMediaKey, uri: cached },
      );
      pendingFadeKeyRef.current = null;
      revealNow(activeMediaKey);
      return;
    }

    let cancelled = false;
    setError(false);
    setResolvedMedia(null);
    setRevealedKey(null);
    pendingFadeKeyRef.current = null;
    opacity.setValue(0);

    getOrDownload(activeMediaKey).then((localUri) => {
      if (cancelled || !mountedRef.current) return;
      if (!localUri) {
        setError(true);
        return;
      }

      // This URI was awaited, so it is genuinely new content: fade it in once
      // when the native view reports it has decoded.
      const applyResolved = () => {
        pendingFadeKeyRef.current = activeMediaKey;
        setResolvedMedia({ key: activeMediaKey, uri: localUri });
      };

      // Pre-resolve dimensions for images without backend dims so the container
      // adopts the true aspect ratio before the image is revealed — no jump.
      if (!readKnownDims(activeMediaKey, imageWidth, imageHeight)) {
        Image.getSize(
          localUri,
          (w, h) => {
            if (cancelled || !mountedRef.current) return;
            recordDims(activeMediaKey, w, h);
            applyResolved();
          },
          () => {
            // getSize failed — show image anyway with default dims
            if (cancelled || !mountedRef.current) return;
            applyResolved();
          },
        );
      } else {
        applyResolved();
      }
    }).catch(() => {
      if (!cancelled && mountedRef.current) setError(true);
    });

    // Detach this cell from the download on unmount/key-change. The download
    // itself keeps running and caches, so scrolling back is an instant hit.
    return () => {
      cancelled = true;
    };
    // Note: no dimension-derived value appears here. This effect *records*
    // dimensions, so depending on them would make it re-enter itself — the
    // defect this change fixes.
  }, [activeMediaKey, retryCount, imageWidth, imageHeight, opacity, revealNow, recordDims]);

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  const handleImageLoad = useCallback((e: any) => {
    if (!activeMediaKey) return;
    // Cache dimensions for future mounts
    if (!readKnownDims(activeMediaKey, imageWidth, imageHeight)) {
      const { width: w, height: h } = e?.nativeEvent?.source ?? {};
      recordDims(activeMediaKey, w, h);
    }
    if (pendingFadeKeyRef.current === activeMediaKey) {
      pendingFadeKeyRef.current = null;
      fadeIn(activeMediaKey);
    } else if (!fadeRef.current) {
      // Already-resolved content (cache hit): stay revealed, never re-fade.
      revealNow(activeMediaKey);
    }
  }, [activeMediaKey, imageWidth, imageHeight, fadeIn, revealNow, recordDims]);

  // Upload in progress — show progress bar
  if (isUploading) {
    const percent = uploadProgress ?? 0;
    return (
      <View style={[styles.placeholder, { width: displayDimensions.width, height: displayDimensions.height }]}>
        {blurhash ? (
          <Blurhash blurhash={blurhash} style={StyleSheet.absoluteFillObject} />
        ) : null}
        <View style={styles.progressOverlay}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${percent}%` }]} />
          </View>
          <Text style={styles.progressText}>{percent}%</Text>
        </View>
      </View>
    );
  }

  if (!activeMediaKey) return null;

  if (error && !uri) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handleRetry}
        style={[styles.placeholder, { width: displayDimensions.width, height: displayDimensions.height }]}>
        <Text style={styles.errorIcon}>🖼️</Text>
        <Text style={styles.errorText}>Tap để thử lại</Text>
      </TouchableOpacity>
    );
  }

  // Layered render: fixed-size container with blurhash underneath, image on top.
  // Container size NEVER changes — eliminates all layout shifts.
  //
  // Reveal timing: a cache hit seeds `opacity` at 1 and `revealedKey` at the key,
  // so the image commits opaque and the blurhash layer is never mounted for it —
  // both happen on the same frame, with no flash of the fallback background. A
  // freshly downloaded image starts at 0, fades once on decode, and only then
  // drops the blurhash layer beneath it.
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => uri && onPress?.(uri)} disabled={!uri}>
      <View style={[styles.container, { width: displayDimensions.width, height: displayDimensions.height }]}>
        {/* Blurhash / placeholder background — visible until image is ready */}
        {(!imageReady || !uri) && (
          blurhash ? (
            <Blurhash blurhash={blurhash} style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, styles.fallbackBg]}>
              {!uri && <Text style={styles.loadingText}>Đang tải...</Text>}
            </View>
          )
        )}

        {/* Actual image — rendered on top; opacity is driven natively so a fade
            costs no React re-renders. */}
        {uri && (
          <Animated.Image
            source={{ uri }}
            style={[StyleSheet.absoluteFillObject, { opacity, borderRadius: 8 }]}
            resizeMode="cover"
            onLoad={handleImageLoad}
            onError={() => setError(true)}
          />
        )}
      </View>
    </TouchableOpacity>
  );
};

// Neutral placeholder/loading surfaces come from the theme so they don't stay a
// bright grey band in dark mode. The upload-progress overlay stays fixed
// light-on-dark: it renders ON the media/blurhash (a dark scrim + white bar),
// which is theme-independent by design.
const makeStyles = (semantic: SemanticTokens) =>
  StyleSheet.create({
    container: {
      borderRadius: 8,
      overflow: 'hidden',
      margin: 4,
      backgroundColor: semantic.surface.level0,
    },
    placeholder: {
      backgroundColor: semantic.surface.level0,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      margin: 4,
      overflow: 'hidden',
    },
    fallbackBg: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: semantic.surface.level0,
    },
    loadingText: { fontSize: 12, color: semantic.text.muted },
    errorIcon: { fontSize: 32 },
    errorText: { fontSize: 12, color: semantic.text.muted, marginTop: 4 },
    progressOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.3)',
    },
    progressBarBg: {
      width: '70%',
      height: 6,
      backgroundColor: 'rgba(255,255,255,0.3)',
      borderRadius: 3,
    },
    progressBarFill: {
      height: 6,
      backgroundColor: '#fff',
      borderRadius: 3,
    },
    progressText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '600',
      marginTop: 6,
    },
  });

export default React.memo(MediaImage);
