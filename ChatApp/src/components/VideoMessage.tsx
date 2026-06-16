import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
} from 'react-native';
import Video from 'react-native-video';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Blurhash } from 'react-native-blurhash';
import { getOrDownload, getFromMemory } from '../services/media/mediaCacheService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIDEO_WIDTH = SCREEN_WIDTH * 0.6;
const VIDEO_HEIGHT = 200;

interface VideoMessageProps {
  message: { mediaKey?: string; mediaDuration?: number; blurhash?: string | null; mediaThumbnailKey?: string | null };
  isVisible?: boolean;
  onPress?: () => void;
}

const VideoMessage: React.FC<VideoMessageProps> = ({ message, onPress }) => {
  const duration = typeof message.mediaDuration === 'number' ? message.mediaDuration : 0;
  const blurhash = typeof message.blurhash === 'string' ? message.blurhash : null;
  const thumbnailKey = message.mediaThumbnailKey || null;

  const [thumbnailUri, setThumbnailUri] = useState<string | null>(() =>
    thumbnailKey ? getFromMemory(thumbnailKey) : null,
  );
  // Fallback: when no server-side thumbnail or blurhash, resolve the video
  // itself to a local URI and let react-native-video render a paused first
  // frame as a lightweight preview.
  const [previewVideoUri, setPreviewVideoUri] = useState<string | null>(() =>
    !thumbnailKey && message.mediaKey ? getFromMemory(message.mediaKey) : null,
  );

  useEffect(() => {
    if (!thumbnailKey) return;
    // Check memory cache synchronously before starting async fetch
    const cached = getFromMemory(thumbnailKey);
    if (cached) {
      setThumbnailUri(cached);
      return;
    }
    let cancelled = false;
    getOrDownload(thumbnailKey).then((uri) => {
      if (!cancelled && uri) setThumbnailUri(uri);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [thumbnailKey]);

  // Resolve the video itself for a paused-frame preview when no thumbnail.
  useEffect(() => {
    if (thumbnailKey || !message.mediaKey) return;
    // Check memory cache synchronously before starting async fetch
    const cached = getFromMemory(message.mediaKey);
    if (cached) {
      setPreviewVideoUri(cached);
      return;
    }
    let cancelled = false;
    getOrDownload(message.mediaKey).then((uri) => {
      if (!cancelled && uri) setPreviewVideoUri(uri);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [thumbnailKey, message.mediaKey]);

  const formatDuration = (seconds: number): string => {
    if (seconds <= 0) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={styles.container}
    >
      {/* Background: server thumbnail > blurhash > paused-frame video preview > dark fallback */}
      {thumbnailUri ? (
        <Image
          source={{ uri: thumbnailUri }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      ) : blurhash ? (
        <Blurhash pointerEvents="none" blurhash={blurhash} style={StyleSheet.absoluteFillObject} />
      ) : null}
      {/* DEBUG: paused-frame <Video> preview disabled — caused Fabric
          "child already has a parent" crash when previewVideoUri resolved
          async after ChatScreen mount. Falls back to dark container. */}
      {false && previewVideoUri ? (
        <Video
          pointerEvents="none"
          source={{ uri: previewVideoUri ?? '' }}
          style={StyleSheet.absoluteFillObject}
          paused
          muted
          resizeMode="cover"
          repeat={false}
          disableFocus
        />
      ) : null}

      {/* Play icon */}
      <View pointerEvents="none" style={styles.playCircle}>
        <MaterialIcons name="play-arrow" size={32} color="#fff" />
      </View>

      {/* Duration badge */}
      {duration > 0 && (
        <View pointerEvents="none" style={styles.durationBadge}>
          <MaterialIcons name="videocam" size={12} color="#fff" />
          <Text style={styles.durationText}>{formatDuration(duration)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    overflow: 'hidden',
    margin: 4,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
  },
});

export default VideoMessage;
