import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { getFromMemory, getOrDownload } from '../services/media/mediaCacheService';
import { KoolaText, koolaColors } from '../ui';

const AVATAR_COLORS = [
  '#2563EB', // blue
  '#10B981', // emerald
  '#F97316', // orange
  '#7C3AED', // violet
  '#0EA5E9', // sky
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F59E0B', // amber
  '#EF4444', // red
  '#84CC16', // lime
  '#6366F1', // indigo
  '#06B6D4', // cyan
];

// djb2-lite hash for better distribution than charCodeAt(0)
function hashToIndex(str: string, mod: number): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % mod;
}

interface Props {
  displayName: string;
  avatar?: string;
  size?: number;
}

function isResolvedUri(value: string): boolean {
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('file://') ||
    value.startsWith('data:')
  );
}

const UserAvatar: React.FC<Props> = ({ displayName, avatar, size = 48 }) => {
  const [resolvedUri, setResolvedUri] = useState<string | null>(() => {
    if (!avatar) return null;
    if (isResolvedUri(avatar)) return avatar;
    return getFromMemory(avatar);
  });
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!avatar) {
      setResolvedUri(null);
      return;
    }
    if (isResolvedUri(avatar)) {
      setResolvedUri(avatar);
      return;
    }

    const cached = getFromMemory(avatar);
    if (cached) {
      setResolvedUri(cached);
      return;
    }

    let cancelled = false;
    setResolvedUri(null);

    const resolve = (isRetry: boolean) => {
      getOrDownload(avatar)
        .then((uri) => {
          if (cancelled) return;
          if (uri) {
            setResolvedUri(uri);
          } else if (!isRetry) {
            retryTimerRef.current = setTimeout(() => {
              if (!cancelled) resolve(true);
            }, 3000);
          }
        })
        .catch(() => {
          if (cancelled) return;
          if (!isRetry) {
            retryTimerRef.current = setTimeout(() => {
              if (!cancelled) resolve(true);
            }, 3000);
          }
        });
    };

    resolve(false);

    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [avatar]);

  const radius = size / 2;
  const shellStyle = {
    width: size,
    height: size,
    borderRadius: radius,
  };

  if (resolvedUri) {
    return (
      <View style={[styles.shell, shellStyle]}>
        <Image source={{ uri: resolvedUri }} style={[styles.avatar, shellStyle]} />
      </View>
    );
  }

  const initial = displayName?.[0]?.toUpperCase() || '?';
  const colorIndex = displayName
    ? hashToIndex(displayName, AVATAR_COLORS.length)
    : 0;

  return (
    <View
      style={[
        styles.placeholder,
        shellStyle,
        { backgroundColor: AVATAR_COLORS[colorIndex] },
      ]}>
      <KoolaText
        tone="surface"
        weight="800"
        style={{ fontSize: Math.max(13, size * 0.4), lineHeight: size * 0.48 }}>
        {initial}
      </KoolaText>
    </View>
  );
};

const styles = StyleSheet.create({
  shell: {
    backgroundColor: koolaColors.canvas,
    borderWidth: 2,
    borderColor: koolaColors.surface,
    overflow: 'hidden',
  },
  avatar: {
    resizeMode: 'cover',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: koolaColors.surface,
  },
});

export default UserAvatar;
