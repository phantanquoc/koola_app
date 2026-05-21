import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Image, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { Blurhash } from 'react-native-blurhash';
import { getOrDownload, getFromMemory } from '../services/media/mediaCacheService';

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

const MediaImage: React.FC<Props> = ({ mediaKey, isUploading, uploadProgress, blurhash, imageWidth, imageHeight, onPress }) => {
  // Resolve initial URI synchronously from memory cache
  const initialUri = mediaKey && mediaKey !== 'media-pending' ? getFromMemory(mediaKey) : null;

  const [uri, setUri] = useState<string | null>(initialUri);
  const [imageReady, setImageReady] = useState(!!initialUri);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const mountedRef = useRef(true);

  // Dimensions: backend props > dimension cache > null (unknown)
  const knownDims = React.useMemo(() => {
    if (imageWidth && imageWidth > 0 && imageHeight && imageHeight > 0) {
      return { w: imageWidth, h: imageHeight };
    }
    if (mediaKey && dimensionCache.has(mediaKey)) {
      return dimensionCache.get(mediaKey)!;
    }
    return null;
  }, [imageWidth, imageHeight, mediaKey]);

  // Display size: use known dims or fixed fallback (never changes mid-render)
  const displayDimensions = React.useMemo(() => {
    if (knownDims) return computeDisplaySize(knownDims.w, knownDims.h);
    return { width: IMAGE_MAX_WIDTH, height: IMAGE_DEFAULT_HEIGHT };
  }, [knownDims]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!mediaKey || mediaKey === 'media-pending') return;
    if (initialUri && retryCount === 0) return;

    let cancelled = false;
    setError(false);

    getOrDownload(mediaKey).then((localUri) => {
      if (cancelled || !mountedRef.current) return;
      if (localUri) {
        // Pre-resolve dimensions for images without backend dims
        // so the container never jumps when the image renders.
        if (!knownDims) {
          Image.getSize(
            localUri,
            (w, h) => {
              if (!cancelled && mountedRef.current && w > 0 && h > 0) {
                dimensionCache.set(mediaKey, { w, h });
                setUri(localUri);
              }
            },
            () => {
              // getSize failed — show image anyway with default dims
              if (!cancelled && mountedRef.current) setUri(localUri);
            },
          );
        } else {
          setUri(localUri);
        }
      } else {
        setError(true);
      }
    }).catch(() => {
      if (!cancelled && mountedRef.current) setError(true);
    });

    return () => { cancelled = true; };
  }, [mediaKey, retryCount]);

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  const handleImageLoad = useCallback((e: any) => {
    setImageReady(true);
    // Cache dimensions for future mounts
    if (mediaKey && !knownDims) {
      const { width: w, height: h } = e.nativeEvent.source;
      if (w > 0 && h > 0) {
        dimensionCache.set(mediaKey, { w, h });
      }
    }
  }, [mediaKey, knownDims]);

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

  if (!mediaKey) return null;

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

        {/* Actual image — rendered on top, opacity transition avoids pop-in */}
        {uri && (
          <Image
            source={{ uri }}
            style={[StyleSheet.absoluteFillObject, { opacity: imageReady ? 1 : 0, borderRadius: 8 }]}
            resizeMode="cover"
            onLoad={handleImageLoad}
            onError={() => setError(true)}
          />
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
    margin: 4,
    backgroundColor: '#f0f0f0',
  },
  placeholder: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
    overflow: 'hidden',
  },
  fallbackBg: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  loadingText: { fontSize: 12, color: '#999' },
  errorIcon: { fontSize: 32 },
  errorText: { fontSize: 12, color: '#999', marginTop: 4 },
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

export default MediaImage;
