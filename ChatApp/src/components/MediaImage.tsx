import React, { useState, useEffect } from 'react';
import { View, Image, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { Blurhash } from 'react-native-blurhash';
import { getOrDownload } from '../services/media/mediaCacheService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_MAX_WIDTH = SCREEN_WIDTH * 0.6;
const IMAGE_MAX_HEIGHT = 300;
const IMAGE_DEFAULT_HEIGHT = 200;

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
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [localDims, setLocalDims] = useState<{ w: number; h: number } | null>(null);

  // Calculate display dimensions based on aspect ratio
  // Priority: 1) backend-provided props, 2) client-measured localDims, 3) fixed fallback
  const displayDimensions = React.useMemo(() => {
    const srcW = (imageWidth && imageWidth > 0) ? imageWidth : (localDims?.w ?? 0);
    const srcH = (imageHeight && imageHeight > 0) ? imageHeight : (localDims?.h ?? 0);
    if (srcW > 0 && srcH > 0) {
      const aspectRatio = srcW / srcH;
      let w = IMAGE_MAX_WIDTH;
      let h = w / aspectRatio;
      if (h > IMAGE_MAX_HEIGHT) {
        h = IMAGE_MAX_HEIGHT;
        w = h * aspectRatio;
      }
      return { width: Math.round(w), height: Math.round(h) };
    }
    return { width: IMAGE_MAX_WIDTH, height: IMAGE_DEFAULT_HEIGHT };
  }, [imageWidth, imageHeight, localDims]);

  useEffect(() => {
    if (!mediaKey || mediaKey === 'media-pending') {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    getOrDownload(mediaKey).then((localUri) => {
      if (cancelled) return;
      if (localUri) {
        setUri(localUri);
      } else {
        setError(true);
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [mediaKey]);

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

  // Loading — show blurhash placeholder or spinner
  if (loading) {
    return (
      <View style={[styles.placeholder, { width: displayDimensions.width, height: displayDimensions.height }]}>
        {blurhash ? (
          <Blurhash blurhash={blurhash} style={StyleSheet.absoluteFillObject} />
        ) : (
          <Text style={styles.loadingText}>Đang tải...</Text>
        )}
      </View>
    );
  }

  if (error || !uri) {
    return (
      <View style={[styles.placeholder, { width: displayDimensions.width, height: displayDimensions.height }]}>
        <Text style={styles.errorIcon}>🖼️</Text>
        <Text style={styles.errorText}>Không tải được ảnh</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => onPress?.(uri)}>
      <Image
        source={{ uri }}
        style={[styles.image, { width: displayDimensions.width, height: displayDimensions.height }]}
        resizeMode="contain"
        onError={() => setError(true)}
        onLoad={(e) => {
          if (!imageWidth && !imageHeight && localDims === null) {
            const { width: w, height: h } = e.nativeEvent.source;
            if (w > 0 && h > 0) {
              setLocalDims({ w, h });
            }
          }
        }}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
    overflow: 'hidden',
  },
  image: {
    borderRadius: 8,
    margin: 4,
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
