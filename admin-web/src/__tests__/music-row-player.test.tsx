/**
 * music-catalog list page behaviour that the spec calls out explicitly:
 * - row playback presigns on click only, never on render
 * - one shared <audio>, switching rows stops the first
 * - a URL tied to a track id (not to a signed URL) is the cache key
 * - export builds CSV client-side and warns when truncated
 * - the create dialog has no free-text audioKey and no durationMs input
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMusicRowPlayer, playbackErrorMessage } from '../components/MusicRowPlayer';

// `vi.mock` is hoisted above this file's imports, so the factory must not close
// over a const declared below it — reference the mock lazily instead.
const { detailMock } = vi.hoisted(() => ({ detailMock: vi.fn() }));

vi.mock('../musicApi', () => ({
  musicApi: { detail: detailMock },
}));

/** jsdom has no media stack; stub the calls the hook makes. */
function stubAudio() {
  const audio = {
    src: '',
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    removeAttribute: vi.fn(),
    load: vi.fn(),
  };
  return audio as unknown as HTMLAudioElement;
}

describe('useMusicRowPlayer', () => {
  let audio: HTMLAudioElement;

  beforeEach(() => {
    detailMock.mockReset();
    audio = stubAudio();
  });

  afterEach(() => vi.restoreAllMocks());

  it('makes no detail request on mount', () => {
    const { result } = renderHook(() => useMusicRowPlayer());
    expect(result.current.playingId).toBeNull();
    expect(detailMock).not.toHaveBeenCalled();
  });

  it('fetches exactly one detail request when a row is played', async () => {
    detailMock.mockResolvedValue({ audioUrl: 'https://signed/1' });
    const { result } = renderHook(() => useMusicRowPlayer());
    // The hook's ref is assigned by the rendered <audio>; set it up directly.
    (result.current.audioRef as { current: HTMLAudioElement }).current = audio;

    await act(async () => {
      result.current.toggle('t1');
      await Promise.resolve();
    });
    expect(detailMock).toHaveBeenCalledTimes(1);
    expect(detailMock).toHaveBeenCalledWith('t1');
  });

  it('plays through a single audio element and replaces the source for a second row', async () => {
    detailMock.mockResolvedValueOnce({ audioUrl: 'https://signed/1' });
    const { result } = renderHook(() => useMusicRowPlayer());
    (result.current.audioRef as { current: HTMLAudioElement }).current = audio;

    await act(async () => {
      result.current.toggle('t1');
      await Promise.resolve();
    });
    const firstSrc = audio.src;
    expect(firstSrc).toBe('https://signed/1');

    detailMock.mockResolvedValueOnce({ audioUrl: 'https://signed/2' });
    await act(async () => {
      result.current.toggle('t2');
      await Promise.resolve();
    });
    // Same element, new source; the previous playback was stopped, not stacked.
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.src).toBe('https://signed/2');
  });

  it('retries exactly once when playback fails', async () => {
    audio.play = vi.fn().mockRejectedValueOnce(new Error('expired')).mockResolvedValue(undefined);
    detailMock.mockResolvedValue({ audioUrl: 'https://signed/1' });
    const { result } = renderHook(() => useMusicRowPlayer());
    (result.current.audioRef as { current: HTMLAudioElement }).current = audio;

    await act(async () => {
      result.current.toggle('t1');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    // One initial fetch + exactly one retry fetch — never a loop.
    expect(detailMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces an error and stops after the retry also fails', async () => {
    audio.play = vi.fn().mockRejectedValue(new Error('gone'));
    detailMock.mockResolvedValue({ audioUrl: 'https://signed/1' });
    const { result } = renderHook(() => useMusicRowPlayer());
    (result.current.audioRef as { current: HTMLAudioElement }).current = audio;

    await act(async () => {
      result.current.toggle('t1');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.errorId).toBe('t1');
    expect(result.current.playingId).toBeNull();
    expect(detailMock).toHaveBeenCalledTimes(2);
  });
});

describe('playbackErrorMessage', () => {
  it('names a missing or unsupported file in Vietnamese', () => {
    // The exact message Chrome produces when the object is absent from MinIO.
    expect(
      playbackErrorMessage(new Error('Failed to load because no supported source was found.')),
    ).toBe('Không tải được file âm thanh — file có thể thiếu trong kho hoặc sai định dạng.');
  });

  it('names an expired signature separately, because retrying fixes it', () => {
    expect(playbackErrorMessage(new Error('403 Forbidden'))).toBe(
      'Đường dẫn phát đã hết hạn — thử lại.',
    );
  });

  it('falls back to a generic sentence for an unknown error', () => {
    expect(playbackErrorMessage(new Error('boom'))).toBe('Không phát được track này.');
    expect(playbackErrorMessage(undefined)).toBe('Không phát được track này.');
  });

  it('never leaks the raw English browser message', () => {
    const msg = playbackErrorMessage(new Error('Failed to load because no supported source was found.'));
    expect(msg).not.toContain('Failed to load');
  });
});
