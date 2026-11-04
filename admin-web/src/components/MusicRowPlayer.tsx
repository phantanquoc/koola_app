/**
 * MusicRowPlayer — audition any catalog row without leaving the list.
 *
 * One shared `<audio>` element for the whole table: clicking a second row stops
 * the first (a table with N players is N things that can play at once). The
 * presigned URL is fetched on **click**, never on render — the list endpoint
 * deliberately carries no URLs, and a 20-row page must not fire 40 presigns.
 *
 * Expiry: the detail request signs for one hour, so a URL can die while the
 * page is open. A playback error triggers exactly one refetch; a second failure
 * surfaces instead of looping.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Loader2 } from 'lucide-react';
import { musicApi } from '../musicApi';

export interface RowPlayerState {
  playingId: string | null;
  loadingId: string | null;
  errorId: string | null;
  errorMessage: string | null;
  toggle: (id: string) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

/**
 * Turn a playback failure into something an operator can act on.
 *
 * The browser's own messages are English and describe the *element*
 * ("Failed to load because no supported source was found.") — useless to
 * someone who needs to know the file is missing from storage, not that the
 * browser lacks a codec. A signed-URL 403 is the one case worth naming
 * separately: it is transient and a retry fixes it.
 */
export function playbackErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : '';
  if (/403|forbidden|expired|signature/i.test(raw)) {
    return 'Đường dẫn phát đã hết hạn — thử lại.';
  }
  if (/no supported source|not supported|MEDIA_ERR_SRC_NOT_SUPPORTED|Failed to load/i.test(raw)) {
    return 'Không tải được file âm thanh — file có thể thiếu trong kho hoặc sai định dạng.';
  }
  return 'Không phát được track này.';
}

export function useMusicRowPlayer(): RowPlayerState {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Number of automatic refetches spent on the current row's URL.
  const retriedRef = useRef(false);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    setPlayingId(null);
  }, []);

  /** Fetch a fresh URL and start playback. Throws so callers can retry once. */
  const start = useCallback(async (id: string) => {
    const track = await musicApi.detail(id);
    const el = audioRef.current;
    if (!el) return;
    el.src = track.audioUrl;
    await el.play();
    setPlayingId(id);
  }, []);

  const toggle = useCallback(
    (id: string) => {
      if (playingId === id) {
        stop();
        return;
      }
      if (loadingId) return; // one load in flight at a time

      stop();
      setErrorId(null);
      setErrorMessage(null);
      retriedRef.current = false;
      setLoadingId(id);

      start(id)
        .catch(() => {
          // First failure: the signed URL may have expired mid-session.
          retriedRef.current = true;
          return start(id).catch((err: unknown) => {
            setErrorId(id);
            setErrorMessage(playbackErrorMessage(err));
          });
        })
        .finally(() => setLoadingId(null));
    },
    [playingId, loadingId, start, stop],
  );

  // Stop audio when the page unmounts so it never leaks across routes.
  useEffect(() => () => stop(), [stop]);

  return { playingId, loadingId, errorId, errorMessage, toggle, audioRef };
}

/** The hidden element every row shares. Render once per table. */
export function MusicRowAudio({ audioRef }: { audioRef: React.RefObject<HTMLAudioElement | null> }) {
  return <audio ref={audioRef} preload="none" hidden aria-hidden="true" />;
}

interface RowPlayButtonProps {
  id: string;
  title: string;
  state: RowPlayerState;
}

export function RowPlayButton({ id, title, state }: RowPlayButtonProps) {
  const isPlaying = state.playingId === id;
  const isLoading = state.loadingId === id;
  const hasError = state.errorId === id;

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm btn-icon"
      onClick={(e) => {
        // The row navigates to the detail page; playing must not navigate.
        e.stopPropagation();
        state.toggle(id);
      }}
      aria-label={isPlaying ? `Dừng nghe ${title}` : `Nghe thử ${title}`}
      title={hasError ? state.errorMessage ?? 'Không phát được bài này' : undefined}
      data-error={hasError || undefined}
    >
      {isLoading ? (
        <Loader2 size={15} className="state-icon-spin" aria-hidden />
      ) : isPlaying ? (
        <Pause size={15} aria-hidden />
      ) : (
        <Play size={15} aria-hidden />
      )}
    </button>
  );
}
