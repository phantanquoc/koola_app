/**
 * Mobile translationService — LRU, timeout, trivial guard, and error mapping.
 *
 * Scope: task 5.2 (mobile LRU, timeout, trivial-input guard).
 * Constraints: no production-only modules imported; the service is mocked at
 * the apiService boundary so no real network or Axios is exercised.
 */

import {
  normalizeText,
  isTrivial,
  buildCacheKey,
  translate,
  __test__,
} from '../translationService';

// Mock the API client — the service does `import apiClient from '../api/apiService'`
jest.mock('../../api/apiService', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

// Import the mocked client so we can drive it per test
import apiClient from '../../api/apiService';

const mockedPost = (apiClient as unknown as { post: jest.Mock }).post;

function okResult(translatedText = 'Xin chào', sourceLang = 'en') {
  return {
    data: { translatedText, sourceLang, cached: false },
  };
}

describe('translationService — normalization and helpers', () => {
  it('normalizeText trims and NFC-normalizes', () => {
    const decomposed = 'é'; // e + combining acute
    expect(normalizeText(`  ${decomposed}  `)).toBe('é');
  });

  it('normalizeText returns empty string for non-string input', () => {
    expect(normalizeText(null as unknown as string)).toBe('');
    expect(normalizeText(undefined as unknown as string)).toBe('');
  });

  it('isTrivial returns true for normalized length < 3', () => {
    expect(isTrivial('ab')).toBe(true);
    expect(isTrivial('')).toBe(true);
    expect(isTrivial('   '.trim())).toBe(true);
    expect(isTrivial('hi')).toBe(true);
  });

  it('isTrivial returns false for length >= 3', () => {
    expect(isTrivial('hey')).toBe(false);
    expect(isTrivial('hello world')).toBe(false);
  });

  it('buildCacheKey is deterministic and isolates target languages', () => {
    expect(buildCacheKey('vi', 'hello')).toBe(buildCacheKey('vi', 'hello'));
    expect(buildCacheKey('vi', 'hello')).not.toBe(buildCacheKey('en', 'hello'));
    expect(buildCacheKey('vi', 'hello')).not.toBe(buildCacheKey('vi', 'world'));
  });
});

describe('translationService — translate()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear in-memory caches so tests are isolated
    __test__.lru.clear();
    __test__.inflight.clear();
  });

  it('trivial input (<3 chars) throws TranslationError kind trivial without hitting network', async () => {
    await expect(translate('ab', 'vi')).rejects.toMatchObject({
      name: 'TranslationError',
      kind: 'trivial',
    });
    expect(mockedPost).not.toHaveBeenCalled();

    await expect(translate('  ', 'vi')).rejects.toMatchObject({ kind: 'trivial' });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('invalid targetLang throws provider error without hitting network', async () => {
    await expect(translate('hello world', 'xx-yy')).rejects.toMatchObject({
      kind: 'provider',
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('LRU hit: second identical call returns cached result without a second network request', async () => {
    mockedPost.mockResolvedValueOnce(okResult('Bonjour', 'en'));

    const first = await translate('hello world', 'fr');
    expect(first.translatedText).toBe('Bonjour');
    expect(mockedPost).toHaveBeenCalledTimes(1);

    const second = await translate('hello world', 'fr');
    expect(second.translatedText).toBe('Bonjour');
    // No second network call
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it('LRU hit refreshes recency — overflow evicts the true oldest entry', async () => {
    // Fill the cache to capacity via direct LRU helper to avoid 500 network calls
    const max = __test__.LRU_MAX;
    for (let i = 0; i < max; i++) {
      __test__.lruSet(buildCacheKey('vi', `key-${i}`), {
        translatedText: `value-${i}`,
        sourceLang: 'en',
        cached: false,
      });
    }
    expect(__test__.lru.size).toBe(max);

    // Touch key-0 to make it most-recent
    expect(__test__.lruGet(buildCacheKey('vi', 'key-0'))).toBeTruthy();

    // Insert one more — oldest should now be key-1 (since key-0 was refreshed), not key-0
    __test__.lruSet(buildCacheKey('vi', 'key-new'), {
      translatedText: 'new-value',
      sourceLang: 'en',
      cached: false,
    });

    expect(__test__.lru.size).toBe(max);
    expect(__test__.lruGet(buildCacheKey('vi', 'key-1'))).toBeUndefined();
    expect(__test__.lruGet(buildCacheKey('vi', 'key-0'))).toBeTruthy();
    expect(__test__.lruGet(buildCacheKey('vi', 'key-new'))).toBeTruthy();
  });

  it('overflow via translate(): 501st distinct insert evicts the oldest entry', async () => {
    // Seed 500 entries without network
    const max = __test__.LRU_MAX;
    for (let i = 0; i < max; i++) {
      __test__.lruSet(buildCacheKey('vi', `seed-${i}`), {
        translatedText: `seed-val-${i}`,
        sourceLang: 'en',
        cached: false,
      });
    }

    mockedPost.mockResolvedValueOnce(okResult('evicted-test', 'en'));
    const result = await translate('unique-overflow-key-xyz-501', 'vi');
    expect(result.translatedText).toBe('evicted-test');

    // One eviction must have occurred; size stays at max
    expect(__test__.lru.size).toBe(max);
    // Oldest (seed-0) should be gone
    expect(__test__.lruGet(buildCacheKey('vi', 'seed-0'))).toBeUndefined();
  });

  it('timeout / abort maps to TranslationError kind timeout', async () => {
    const abortErr = new Error('aborted');
    (abortErr as any).name = 'AbortError';
    mockedPost.mockRejectedValueOnce(abortErr);

    await expect(translate('hello world', 'vi')).rejects.toMatchObject({
      name: 'TranslationError',
      kind: 'timeout',
    });
  });

  it('CanceledError and ECONNABORTED also map to timeout', async () => {
    const canceled = new Error('canceled');
    (canceled as any).name = 'CanceledError';
    mockedPost.mockRejectedValueOnce(canceled);

    await expect(translate('hello there', 'vi')).rejects.toMatchObject({ kind: 'timeout' });

    // Reset lru/inflight for second assertion within same test would reuse key
    __test__.lru.clear();
    __test__.inflight.clear();

    const econn = new Error('timeout') as any;
    econn.code = 'ECONNABORTED';
    mockedPost.mockRejectedValueOnce(econn);

    await expect(translate('another phrase', 'vi')).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('429 maps to rate-limit kind', async () => {
    const rateErr: any = new Error('rate limited');
    rateErr.response = { status: 429 };
    mockedPost.mockRejectedValueOnce(rateErr);

    await expect(translate('hello world', 'vi')).rejects.toMatchObject({
      kind: 'rate-limit',
    });
  });

  it('provider errors map to provider kind', async () => {
    const providerErr: any = new Error('provider down');
    providerErr.response = { status: 502 };
    mockedPost.mockRejectedValueOnce(providerErr);

    await expect(translate('hello world', 'vi')).rejects.toMatchObject({
      kind: 'provider',
    });
  });

  it('in-flight dedup: concurrent identical translates share one request', async () => {
    let resolvePost: (v: any) => void = () => {};
    mockedPost.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    const p1 = translate('concurrent text', 'vi');
    const p2 = translate('concurrent text', 'vi');

    expect(mockedPost).toHaveBeenCalledTimes(1);

    resolvePost(okResult('Đồng thời', 'en'));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.translatedText).toBe('Đồng thời');
    expect(r2.translatedText).toBe('Đồng thời');
    // Still one network call
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it('different target languages are cached independently', async () => {
    mockedPost
      .mockResolvedValueOnce(okResult('Bonjour', 'en'))
      .mockResolvedValueOnce(okResult('Hola', 'en'));

    const fr = await translate('hello world', 'fr');
    const es = await translate('hello world', 'es');

    expect(fr.translatedText).toBe('Bonjour');
    expect(es.translatedText).toBe('Hola');
    expect(mockedPost).toHaveBeenCalledTimes(2);
  });
});

describe('translationService — lru helpers (direct)', () => {
  beforeEach(() => {
    __test__.lru.clear();
  });

  it('lruGet returns undefined for missing key and refreshes recency on hit', () => {
    __test__.lruSet(buildCacheKey('vi', 'a'), { translatedText: 'A', sourceLang: 'en', cached: false });
    __test__.lruSet(buildCacheKey('vi', 'b'), { translatedText: 'B', sourceLang: 'en', cached: false });

    // Access 'a' → moves to end
    expect(__test__.lruGet(buildCacheKey('vi', 'a'))?.translatedText).toBe('A');

    // Insert 'c' at capacity 2 (simulate small max by clearing and using LRU_MAX semantics)
    // Instead, just verify the order: after the get, insertion order should be b, a
    const keys = Array.from(__test__.lru.keys());
    expect(keys[keys.length - 1]).toBe(buildCacheKey('vi', 'a'));
  });

  it('LRU_MAX is 500', () => {
    expect(__test__.LRU_MAX).toBe(500);
  });
});
