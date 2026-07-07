import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
} from 'react-native';
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
    return () => {
      cancelled = true;
    };
  }, [thumbnailKey]);

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
      {/* Background: server thumbnail > blurhash > dark fallback.
          No client-side video-frame preview: pulling the full .mp4 just to
          show a paused frame wasted bandwidth (and the <Video> preview was
          disabled anyway due to Fabric "child already has a parent"). A real
          poster frame needs a server-generated thumbnail (backend ffmpeg). */}
      {thumbnailUri ? (
        <Image
          source={{ uri: thumbnailUri }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      ) : blurhash ? (
        <Blurhash pointerEvents="none" blurhash={blurhash} style={StyleSheet.absoluteFillObject} />
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
