/**
 * useCommerceProductList — reset on params, guarded loadMore, dedupe,
 * stale-response guard, state machine.
 */
import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create, act } from 'react-test-renderer';
import type {
  ProductCard,
  ProductListParams,
  ProductListResponse,
} from '../../../../services/api/apiService';

type Deferred = {
  params: ProductListParams;
  resolve: (r: ProductListResponse) => void;
  reject: (e: unknown) => void;
};
const mockCalls: Deferred[] = [];

jest.mock('../../../../services/api/apiService', () => ({
  commerceApi: {
    listProducts: jest.fn(
      (params: ProductListParams) =>
        new Promise((resolve, reject) => {
          mockCalls.push({ params, resolve, reject });
        }),
    ),
  },
}));

import {
  useCommerceProductList,
  type ProductListQuery,
  type UseCommerceProductListResult,
} from '../useCommerceProductList';

const card = (id: string): ProductCard => ({
  id,
  name: id,
  price: 1000,
  originalPrice: null,
  imageUrl: null,
  imageKey: null,
  category: 'grocery',
  tags: [],
  deliveryText: '',
  soldCount: 0,
  seller: { id: 's', displayName: 'S', verified: true, province: null },
});

const page = (
  ids: string[],
  p: number,
  hasMore: boolean,
  total = 99,
): ProductListResponse => ({ data: ids.map(card), page: p, limit: 2, total, hasMore });

let hook: UseCommerceProductListResult;
function Probe({ query }: { query: ProductListQuery }) {
  hook = useCommerceProductList(query, { limit: 2 });
  return null;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useCommerceProductList', () => {
  let renderer: { update: (el: React.ReactElement) => void; unmount: () => void };

  beforeEach(async () => {
    mockCalls.length = 0;
    await act(async () => {
      renderer = create(<Probe query={{}} />);
    });
  });

  afterEach(() => {
    act(() => renderer.unmount());
  });

  it('starts in initialLoading and becomes ready', async () => {
    expect(hook.status).toBe('initialLoading');
    expect(mockCalls[0].params).toMatchObject({ page: 1, limit: 2 });
    await act(async () => mockCalls[0].resolve(page(['a', 'b'], 1, true)));
    expect(hook.status).toBe('ready');
    expect(hook.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(hook.hasMore).toBe(true);
  });

  it('reports empty for zero results', async () => {
    await act(async () => mockCalls[0].resolve(page([], 1, false, 0)));
    expect(hook.status).toBe('empty');
  });

  it('first-load failure → error, retry repeats page 1', async () => {
    await act(async () => mockCalls[0].reject(new Error('net')));
    expect(hook.status).toBe('error');
    await act(async () => hook.retry());
    expect(mockCalls).toHaveLength(2);
    expect(mockCalls[1].params.page).toBe(1);
    await act(async () => mockCalls[1].resolve(page(['a'], 1, false)));
    expect(hook.status).toBe('ready');
  });

  it('loadMore appends next page, guarded while in flight', async () => {
    await act(async () => mockCalls[0].resolve(page(['a', 'b'], 1, true)));
    await act(async () => {
      hook.loadMore();
      hook.loadMore();
      hook.loadMore();
    });
    expect(mockCalls).toHaveLength(2);
    expect(mockCalls[1].params.page).toBe(2);
    expect(hook.status).toBe('loadingMore');
    await act(async () => mockCalls[1].resolve(page(['c', 'd'], 2, false)));
    expect(hook.items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    // No more pages → loadMore is a no-op.
    await act(async () => hook.loadMore());
    expect(mockCalls).toHaveLength(2);
  });

  it('dedupes rows that shifted between pages', async () => {
    await act(async () => mockCalls[0].resolve(page(['a', 'b'], 1, true)));
    await act(async () => hook.loadMore());
    await act(async () => mockCalls[1].resolve(page(['b', 'c'], 2, false)));
    expect(hook.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('loadMore failure keeps rows and retry re-requests the same page', async () => {
    await act(async () => mockCalls[0].resolve(page(['a', 'b'], 1, true)));
    await act(async () => hook.loadMore());
    await act(async () => mockCalls[1].reject(new Error('net')));
    expect(hook.status).toBe('loadMoreError');
    expect(hook.items).toHaveLength(2);
    await act(async () => hook.retry());
    expect(mockCalls[2].params.page).toBe(2);
  });

  it('param change resets to page 1 and replaces the list', async () => {
    await act(async () => mockCalls[0].resolve(page(['a', 'b'], 1, true)));
    await act(async () => renderer.update(<Probe query={{ sort: 'priceLow' }} />));
    expect(mockCalls[1].params).toMatchObject({ sort: 'priceLow', page: 1 });
    await act(async () => mockCalls[1].resolve(page(['z'], 1, false)));
    expect(hook.items.map((i) => i.id)).toEqual(['z']);
  });

  it('drops a stale response from the previous params', async () => {
    // Request #0 (no filter) is slow; params change → request #1.
    await act(async () => renderer.update(<Probe query={{ q: 'rau' }} />));
    expect(mockCalls[1].params.q).toBe('rau');
    await act(async () => mockCalls[1].resolve(page(['rau-1'], 1, false)));
    // Old response arrives last — must be ignored.
    await act(async () => mockCalls[0].resolve(page(['old-1', 'old-2'], 1, true)));
    expect(hook.items.map((i) => i.id)).toEqual(['rau-1']);
    expect(hook.hasMore).toBe(false);
    await settle();
  });

  it('does not refetch when params are equal by value', async () => {
    await act(async () => mockCalls[0].resolve(page(['a'], 1, false)));
    await act(async () => renderer.update(<Probe query={{}} />));
    await act(async () => renderer.update(<Probe query={{ q: '  ' }} />));
    expect(mockCalls).toHaveLength(1);
  });
});
