import React, { useEffect, useRef, useState } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { getFromMemory, getOrDownload } from '../services/media/mediaCacheService';
import { KoolaAvatar } from '../ui/KoolaAvatar';

interface Props {
  displayName: string;
  avatar?: string;
  size?: number;
  showOnline?: boolean;
  style?: StyleProp<ViewStyle>;
}

type ResolvedAvatar = { key: string; uri: string } | null;

function isResolvedUri(value: string): boolean {
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('file://') ||
    value.startsWith('data:')
  );
}

function resolveAvatarSync(avatar?: string): ResolvedAvatar {
  if (!avatar) return null;
  if (isResolvedUri(avatar)) return { key: avatar, uri: avatar };
  const cached = getFromMemory(avatar);
  return cached ? { key: avatar, uri: cached } : null;
}

const UserAvatar: React.FC<Props> = ({
  displayName,
  avatar,
  size = 48,
  showOnline = false,
  style,
}) => {
  const avatarKey = avatar ?? '';
  const [resolvedAvatar, setResolvedAvatar] = useState<ResolvedAvatar>(() =>
    resolveAvatarSync(avatar),
  );
  const resolvedUri =
    resolvedAvatar?.key === avatarKey ? resolvedAvatar.uri : null;
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (!avatar) {
      setResolvedAvatar(null);
      return;
    }
    if (isResolvedUri(avatar)) {
      setResolvedAvatar({ key: avatar, uri: avatar });
      return;
    }

    const cached = getFromMemory(avatar);
    if (cached) {
      setResolvedAvatar({ key: avatar, uri: cached });
      return;
    }

    let cancelled = false;
    setResolvedAvatar(null);

    const resolve = (isRetry: boolean) => {
      getOrDownload(avatar)
        .then((uri) => {
          if (cancelled) return;
          if (uri) {
            setResolvedAvatar({ key: avatar, uri });
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

  return (
    <KoolaAvatar
      displayName={displayName}
      imageUri={resolvedUri}
      size={size}
      showOnline={showOnline}
      style={style}
    />
  );
};

export default UserAvatar;
