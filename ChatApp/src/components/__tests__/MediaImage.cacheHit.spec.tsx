/**
 * MediaImage.cacheHit.spec.tsx — coverage for fix group 2.
 *
 * Fix group 2 addressed two defects in `MediaImage`, both of which produced a
 * visible flash while scrolling:
 *
 *   1. The resolution effect depended on a value derived from the dimension
 *      cache — a cache the effect itself writes. Recording dimensions therefore
 *      re-entered the effect, whose re-run tears down the resolved URI
 *      (`setResolvedMedia(null)`, `setRevealedKey(null)`, `opacity → 0`) and
 *      re-issues the download. The row blanked and reloaded for no reason.
 *
 *   2. A synchronous memory-cache hit was still treated as new content: ready
 *      state started false and the image faded in from zero, so an image already
 *      on disk flashed its placeholder before appearing.
 *
 * WHAT THIS FILE PROVES, AND HOW
 * Both are asserted BEHAVIOURALLY against the real component, rendered with
 * `react-test-renderer`. Neither defect is visible in the source at a glance —
 * defect 1 lives in a dependency array and defect 2 in the interaction between a
 * state initialiser and an effect — so a source assertion would be close to
 * worthless here. What makes them observable is that each has a crisp runtime
 * signature: re-entry means a second `getOrDownload` call, and a reset ready
 * state means a placeholder layer mounted under an image at opacity 0.
 *
 * `MediaImage` is rendered WITHOUT a `ThemeProvider` on purpose: `useTheme`
 * falls back to a fully populated default context, so the styles resolve
 * identically while the provider's async `getThemeMode` hydration — which logs
 * and settles outside `act` — stays out of these tests.
 */

import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create as render, act } from 'react-test-renderer';
import { Image } from 'react-native';

// The real cache service reaches for MMKV, the filesystem and the network. Both
// of its reads are stubbed so each test states its own cache outcome outright.
jest.mock('../../services/media/mediaCacheService', () => ({
  getFromMemory: jest.fn(),
  getOrDownload: jest.fn(),
}));

import { getFromMemory, getOrDownload } from '../../services/media/mediaCacheService';
import MediaImage from '../MediaImage';

const getFromMemoryMock = getFromMemory as jest.Mock;
const getOrDownloadMock = getOrDownload as jest.Mock;

type JsonNode = {
  type: string;
  props: Record<string, unknown>;
  children: JsonNode[] | null;
} | null;

interface Renderer {
  toJSON: () => JsonNode;
  root: { findAll: (predicate: (node: { type: unknown }) => boolean) => Array<{ props: Record<string, (event: unknown) => void> }> };
  unmount: () => void;
}

/**
 * Every test uses a unique mediaKey. `MediaImage` keeps a module-level
 * `dimensionCache` that deliberately outlives unmounts (that is the point of it —
 * scrolling back must not re-measure), so a shared key would let one test seed
 * another's dimensions and quietly change which branch it exercises.
 */
let keySeq = 0;
const nextKey = () => `media-key-${++keySeq}`;

/**
 * Mounted trees are tracked and unmounted after every test.
 *
 * Required, not tidiness: revealing an awaited download starts a real
 * `Animated.timing`, which outlives the test and would call `setRevealedKey`
 * after jest has torn the environment down (crashing the worker, not just
 * failing). `MediaImage`'s unmount cleanup stops the animation and clears its
 * mounted flag, which is exactly the guard being relied on here.
 */
let mounted: Renderer[] = [];

function mount(element: React.ReactElement): Renderer {
  let tree!: Renderer;
  act(() => {
    tree = render(element) as Renderer;
  });
  mounted.push(tree);
  return tree;
}

async function mountAsync(element: React.ReactElement): Promise<Renderer> {
  let tree!: Renderer;
  await act(async () => {
    tree = render(element) as Renderer;
  });
  mounted.push(tree);
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => {
    for (const tree of mounted) tree.unmount();
  });
  mounted = [];
});

function flatten(node: NonNullable<JsonNode>): NonNullable<JsonNode>[] {
  const out = [node];
  for (const child of node.children ?? []) {
    if (child) out.push(...flatten(child));
  }
  return out;
}

function nodes(tree: Renderer): NonNullable<JsonNode>[] {
  const root = tree.toJSON();
  return root ? flatten(root) : [];
}

/**
 * Reads the rendered image's opacity out of the committed tree.
 *
 * Taken from `toJSON()` rather than from the `Animated.Value` object: the
 * serialized tree is what the native side would receive, so this asserts the
 * value that actually reaches the screen rather than an internal field.
 */
function imageOpacity(tree: Renderer): number | undefined {
  const image = nodes(tree).find((n) => n.type === 'Image');
  if (!image) return undefined;
  for (const style of ([] as unknown[]).concat(image.props.style as unknown)) {
    const opacity = (style as { opacity?: unknown } | null)?.opacity;
    if (typeof opacity === 'number') return opacity;
  }
  return undefined;
}

function imageUri(tree: Renderer): string | undefined {
  const image = nodes(tree).find((n) => n.type === 'Image');
  return (image?.props.source as { uri?: string } | undefined)?.uri;
}

/**
 * The blurhash / "Đang tải…" layer, mounted only while the image is not ready.
 * Matched on the centring style unique to `fallbackBg`; the container above it
 * carries no `justifyContent`, so this cannot match the wrapper by accident.
 */
function hasPlaceholderLayer(tree: Renderer): boolean {
  return nodes(tree).some(
    (n) =>
      n.type === 'Blurhash' ||
      ([] as unknown[])
        .concat(n.props.style as unknown)
        .some((s) => {
          const style = s as { justifyContent?: string; alignItems?: string } | null;
          return style?.justifyContent === 'center' && style?.alignItems === 'center';
        }),
  );
}

/** Container width/height — proves whether recorded dimensions were adopted. */
function containerSize(tree: Renderer): { width?: number; height?: number } {
  for (const node of nodes(tree)) {
    for (const style of ([] as unknown[]).concat(node.props.style as unknown)) {
      const s = style as { width?: number; height?: number } | null;
      if (typeof s?.width === 'number' && typeof s?.height === 'number') {
        return { width: s.width, height: s.height };
      }
    }
  }
  return {};
}

function fireImageLoad(tree: Renderer, width: number, height: number) {
  const image = tree.root.findAll((n) => n.type === 'Image')[0];
  act(() => {
    image.props.onLoad({ nativeEvent: { source: { width, height } } });
  });
}

// ─── 1. Recording dimensions must not re-enter the resolution effect ──────────

describe('MediaImage resolution effect is not re-entered by recorded dimensions', () => {
  it('does not re-download after Image.getSize reports dimensions', async () => {
    const mediaKey = nextKey();
    getFromMemoryMock.mockReturnValue(null);
    getOrDownloadMock.mockResolvedValue('file:///downloaded.jpg');

    // Held rather than invoked inline, so the dimension callback lands as its own
    // committed update — which is when the old dependency array re-fired.
    let reportSize: ((w: number, h: number) => void) | undefined;
    const getSize = jest
      .spyOn(Image, 'getSize')
      .mockImplementation((_uri, onSuccess) => {
        reportSize = onSuccess;
      });

    try {
      const tree = await mountAsync(<MediaImage mediaKey={mediaKey} />);

      expect(getOrDownloadMock).toHaveBeenCalledTimes(1);
      expect(getSize).toHaveBeenCalledTimes(1);

      act(() => {
        reportSize!(1000, 500);
      });

      // The effect re-runs only when its dependencies change. A second call here
      // is the defect's signature: the row would blank and re-fetch mid-scroll.
      expect(getOrDownloadMock).toHaveBeenCalledTimes(1);
      expect(getSize).toHaveBeenCalledTimes(1);
      // And the resolved image survived: a re-run would have cleared it.
      expect(imageUri(tree)).toBe('file:///downloaded.jpg');
    } finally {
      getSize.mockRestore();
    }
  });

  it('adopts the recorded aspect ratio, so the check above is not vacuous', async () => {
    // Companion to the test above. If the dimensions were never recorded at all,
    // "no second download" would hold trivially. This asserts the recording
    // genuinely happened and reached the layout — a 2:1 source, so the container
    // becomes 225 tall at 450 wide instead of keeping the 200 default.
    const mediaKey = nextKey();
    getFromMemoryMock.mockReturnValue(null);
    getOrDownloadMock.mockResolvedValue('file:///downloaded.jpg');

    let reportSize: ((w: number, h: number) => void) | undefined;
    const getSize = jest
      .spyOn(Image, 'getSize')
      .mockImplementation((_uri, onSuccess) => {
        reportSize = onSuccess;
      });

    try {
      const tree = await mountAsync(<MediaImage mediaKey={mediaKey} />);
      const before = containerSize(tree);

      act(() => {
        reportSize!(1000, 500);
      });

      const after = containerSize(tree);
      expect(after.height).not.toBe(before.height);
      expect(after.width! / after.height!).toBeCloseTo(2, 2);
    } finally {
      getSize.mockRestore();
    }
  });

  it('does not re-download when dimensions arrive through onLoad', async () => {
    // The second route into `recordDims`: `Image.getSize` fails, the image is
    // shown anyway, and the native onLoad event supplies the real size. Same
    // requirement — recording must not disturb the resolution effect.
    const mediaKey = nextKey();
    getFromMemoryMock.mockReturnValue(null);
    getOrDownloadMock.mockResolvedValue('file:///downloaded.jpg');

    const getSize = jest
      .spyOn(Image, 'getSize')
      .mockImplementation((_uri, _onSuccess, onFailure) => {
        onFailure?.(new Error('size unavailable'));
      });

    try {
      const tree = await mountAsync(<MediaImage mediaKey={mediaKey} />);
      expect(getOrDownloadMock).toHaveBeenCalledTimes(1);

      fireImageLoad(tree, 800, 400);

      expect(getOrDownloadMock).toHaveBeenCalledTimes(1);
      expect(imageUri(tree)).toBe('file:///downloaded.jpg');
      // The measurement was adopted, so this is not vacuous either.
      const size = containerSize(tree);
      expect(size.width! / size.height!).toBeCloseTo(2, 2);
    } finally {
      getSize.mockRestore();
    }
  });
});

// ─── 2. A cache hit is revealed opaque, with ready state never reset ─────────

describe('MediaImage reveals a cache-resolved image at full opacity', () => {
  it('commits the first frame opaque with no placeholder underneath', () => {
    const mediaKey = nextKey();
    getFromMemoryMock.mockReturnValue('file:///cached.jpg');
    getOrDownloadMock.mockResolvedValue('file:///cached.jpg');

    const tree = mount(<MediaImage mediaKey={mediaKey} blurhash="LEHV6nWB2yk8pyo" />);

    expect(imageUri(tree)).toBe('file:///cached.jpg');
    // Opaque immediately: the file is already on disk, so there is nothing to
    // fade in. A 0 here is the flash this fix removed.
    expect(imageOpacity(tree)).toBe(1);
    // `imageReady` was true on the first committed render, so the blurhash layer
    // was never mounted — not mounted and then dropped, which would itself flash.
    expect(hasPlaceholderLayer(tree)).toBe(false);
    // Resolved synchronously: the async path was never entered.
    expect(getOrDownloadMock).not.toHaveBeenCalled();
  });

  it('stays opaque when onLoad fires, rather than re-fading', () => {
    // `onLoad` still arrives for a cached image. Routing it into the fade path
    // would drop opacity back to 0 and flash an image the user can already see.
    const mediaKey = nextKey();
    getFromMemoryMock.mockReturnValue('file:///cached.jpg');
    getOrDownloadMock.mockResolvedValue('file:///cached.jpg');

    const tree = mount(<MediaImage mediaKey={mediaKey} blurhash="LEHV6nWB2yk8pyo" />);

    fireImageLoad(tree, 600, 600);

    expect(imageOpacity(tree)).toBe(1);
    expect(hasPlaceholderLayer(tree)).toBe(false);
  });

  it('still fades an awaited download in from zero', async () => {
    // Companion to the two tests above: proves they assert a cache-hit-specific
    // behaviour and not simply that opacity is always 1. Genuinely new content
    // must still start transparent behind its placeholder.
    const mediaKey = nextKey();
    getFromMemoryMock.mockReturnValue(null);
    getOrDownloadMock.mockResolvedValue('file:///downloaded.jpg');

    const getSize = jest
      .spyOn(Image, 'getSize')
      .mockImplementation((_uri, _onSuccess, onFailure) => {
        onFailure?.(new Error('size unavailable'));
      });

    try {
      const tree = await mountAsync(
        <MediaImage mediaKey={mediaKey} blurhash="LEHV6nWB2yk8pyo" />,
      );

      expect(imageUri(tree)).toBe('file:///downloaded.jpg');
      expect(imageOpacity(tree)).toBe(0);
      expect(hasPlaceholderLayer(tree)).toBe(true);
    } finally {
      getSize.mockRestore();
    }
  });
});
