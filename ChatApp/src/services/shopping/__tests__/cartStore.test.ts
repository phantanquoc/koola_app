/**
 * cartStore — persistence, per-account isolation, quantity cap, validation.
 * Uses the global MMKV mock from jest/setup.js (one Map shared per test file;
 * `jest.isolateModules` gives each "app launch" a fresh in-memory store module
 * reading the same persisted Map, which is exactly a cold restart).
 */
import type { ValidateResult } from '../../api/apiService';

/**
 * Device storage that outlives a module reload. The global jest/setup.js mock
 * keeps its Map inside the mock factory, and `jest.isolateModules` re-runs that
 * factory — which would wipe "disk" on every simulated restart. Keeping the Map
 * at file scope (`mock` prefix → allowed in the hoisted factory) models MMKV's
 * persistence across launches.
 */
const mockDisk = new Map<string, unknown>();
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: (k: string, v: unknown) => mockDisk.set(k, v),
    getString: (k: string) => {
      const v = mockDisk.get(k);
      return typeof v === 'string' ? v : undefined;
    },
    delete: (k: string) => mockDisk.delete(k),
    clearAll: () => mockDisk.clear(),
    getAllKeys: () => Array.from(mockDisk.keys()),
    contains: (k: string) => mockDisk.has(k),
  })),
}));

type Store = typeof import('../cartStore');

function freshStore(): Store {
  let mod!: Store;
  jest.isolateModules(() => {
    mod = require('../cartStore');
  });
  return mod;
}

const shopA = { id: 'seller-a', displayName: 'Shop A' };
const shopB = { id: 'seller-b', displayName: 'Shop B' };
const snap = (name: string, price: number, seller = shopA) => ({
  name,
  price,
  imageKey: `img/${name}.jpg`,
  seller,
});

const ok = (id: string, price: number, name = id, seller = shopA): ValidateResult => ({
  id,
  available: true,
  price,
  name,
  imageUrl: null,
  seller,
});
const gone = (id: string): ValidateResult => ({
  id,
  available: false,
  price: null,
  name: null,
  imageUrl: null,
  seller: null,
});

describe('cartStore', () => {
  let s: Store;

  beforeEach(() => {
    s = freshStore();
    s.cartStore.clearAllAccounts();
    s.cartStore.setAccount('user-1');
  });

  it('persists lines and survives an app restart', () => {
    s.cartStore.add('p1', snap('Rau', 89000));
    s.cartStore.add('p2', snap('Gạo', 168000), 3);

    const restarted = freshStore();
    expect(restarted.cartStore.getLines()).toEqual([]); // no account yet
    restarted.cartStore.setAccount('user-1');
    const lines = restarted.cartStore.getLines();
    expect(lines.map((l) => [l.productId, l.quantity])).toEqual([
      ['p1', 1],
      ['p2', 3],
    ]);
    expect(lines[0].snapshot).toEqual(snap('Rau', 89000));
    expect(restarted.cartStore.getTotalQuantity()).toBe(4);
  });

  it('isolates carts per account and swaps on switch', () => {
    s.cartStore.add('p1', snap('Rau', 89000));
    s.cartStore.setAccount('biz-1');
    expect(s.cartStore.getLines()).toEqual([]);
    s.cartStore.add('p9', snap('Son', 199000));
    s.cartStore.setAccount('user-1');
    expect(s.cartStore.getLines().map((l) => l.productId)).toEqual(['p1']);
    s.cartStore.setAccount('biz-1');
    expect(s.cartStore.getLines().map((l) => l.productId)).toEqual(['p9']);
  });

  it('logout clears every account cart from the device', () => {
    s.cartStore.add('p1', snap('Rau', 89000));
    s.cartStore.setAccount('biz-1');
    s.cartStore.add('p9', snap('Son', 199000));
    s.cartStore.clearAllAccounts();
    expect(s.cartStore.getAccount()).toBeNull();
    expect(s.cartStore.getLines()).toEqual([]);

    const restarted = freshStore();
    restarted.cartStore.setAccount('user-1');
    expect(restarted.cartStore.getLines()).toEqual([]);
    restarted.cartStore.setAccount('biz-1');
    expect(restarted.cartStore.getLines()).toEqual([]);
  });

  it('refuses to add while signed out', () => {
    s.cartStore.setAccount(null);
    expect(s.cartStore.add('p1', snap('Rau', 89000))).toBe(false);
    expect(s.cartStore.getLines()).toEqual([]);
  });

  it('adding an existing product increments, capped at 99', () => {
    s.cartStore.add('p1', snap('Rau', 89000));
    s.cartStore.add('p1', snap('Rau', 89000));
    expect(s.cartStore.getLines()[0].quantity).toBe(2);
    s.cartStore.add('p1', snap('Rau', 89000), 500);
    expect(s.cartStore.getLines()[0].quantity).toBe(99);
    expect(s.cartStore.getLines()).toHaveLength(1);
  });

  it('setQty clamps to 1..99 and remove deletes the line', () => {
    s.cartStore.add('p1', snap('Rau', 89000));
    s.cartStore.setQty('p1', 0);
    expect(s.cartStore.getLines()[0].quantity).toBe(1);
    s.cartStore.setQty('p1', 150);
    expect(s.cartStore.getLines()[0].quantity).toBe(99);
    s.cartStore.remove('p1');
    expect(s.cartStore.getLines()).toEqual([]);
  });

  it('notifies subscribers and changes snapshot identity only on change', () => {
    const listener = jest.fn();
    const unsub = s.cartStore.subscribe(listener);
    const before = s.cartStore.getLines();
    s.cartStore.add('p1', snap('Rau', 89000));
    expect(listener).toHaveBeenCalledTimes(1);
    const after = s.cartStore.getLines();
    expect(after).not.toBe(before);
    s.cartStore.setQty('p1', 1); // unchanged
    s.cartStore.applyValidation([ok('p1', 89000, 'Rau')]); // unchanged
    expect(listener).toHaveBeenCalledTimes(1);
    expect(s.cartStore.getLines()).toBe(after);
    unsub();
  });

  describe('applyValidation', () => {
    it('updates a changed price, keeps the old one, and persists it', () => {
      s.cartStore.add('p1', snap('Rau', 89000));
      s.cartStore.applyValidation([ok('p1', 95000, 'Rau')]);
      const [line] = s.cartStore.getLines();
      expect(line.snapshot.price).toBe(95000);
      expect(line.previousPrice).toBe(89000);
      expect(line.available).toBe(true);

      const restarted = freshStore();
      restarted.cartStore.setAccount('user-1');
      expect(restarted.cartStore.getLines()[0].snapshot.price).toBe(95000);
    });

    it('a repeat validation with the same price keeps the notice', () => {
      s.cartStore.add('p1', snap('Rau', 89000));
      s.cartStore.applyValidation([ok('p1', 95000, 'Rau')]);
      s.cartStore.applyValidation([ok('p1', 95000, 'Rau')]);
      expect(s.cartStore.getLines()[0].previousPrice).toBe(89000);
      s.cartStore.acknowledgePriceChange('p1');
      expect(s.cartStore.getLines()[0].previousPrice).toBeNull();
    });

    it('flags unavailable lines and excludes them from group totals', () => {
      s.cartStore.add('p1', snap('Rau', 89000), 2);
      s.cartStore.add('p2', snap('Gạo', 100000));
      s.cartStore.applyValidation([gone('p1'), ok('p2', 100000, 'Gạo')]);
      const lines = s.cartStore.getLines();
      expect(lines.map((l) => l.available)).toEqual([false, true]);
      const [group] = s.groupCartLines(lines);
      expect(group.subtotal).toBe(100000);
      expect(group.itemCount).toBe(1);
    });

    it('a product that comes back becomes available again', () => {
      s.cartStore.add('p1', snap('Rau', 89000));
      s.cartStore.applyValidation([gone('p1')]);
      s.cartStore.applyValidation([ok('p1', 89000, 'Rau')]);
      expect(s.cartStore.getLines()[0].available).toBe(true);
    });

    it('leaves lines absent from the results untouched', () => {
      s.cartStore.add('p1', snap('Rau', 89000));
      s.cartStore.add('p2', snap('Gạo', 100000));
      s.cartStore.applyValidation([ok('p2', 120000, 'Gạo')]);
      const [l1, l2] = s.cartStore.getLines();
      expect(l1.snapshot.price).toBe(89000);
      expect(l2.snapshot.price).toBe(120000);
    });
  });

  it('groups by seller with separate subtotals', () => {
    s.cartStore.add('p1', snap('Rau', 89000, shopA), 2);
    s.cartStore.add('p2', snap('Tai nghe', 249000, shopB));
    s.cartStore.add('p3', snap('Gạo', 10000, shopA));
    const groups = s.groupCartLines(s.cartStore.getLines());
    expect(groups.map((g) => [g.seller.id, g.subtotal, g.lines.length])).toEqual([
      ['seller-a', 188000, 2],
      ['seller-b', 249000, 1],
    ]);
  });

  it('ignores malformed persisted data instead of crashing', () => {
    const { MMKV } = require('react-native-mmkv');
    const raw = new MMKV({ id: 'shopping-cart' });
    raw.set('cart:broken', '{not json');
    raw.set('cart:weird', JSON.stringify([{ productId: 'x' }, 42]));
    s.cartStore.setAccount('broken');
    expect(s.cartStore.getLines()).toEqual([]);
    s.cartStore.setAccount('weird');
    expect(s.cartStore.getLines()).toEqual([]);
  });
});

describe('cartBadgeLabel', () => {
  it('hides at 0 and caps at 99+', () => {
    const { cartBadgeLabel } = require('../useCart');
    expect(cartBadgeLabel(0)).toBeNull();
    expect(cartBadgeLabel(1)).toBe('1');
    expect(cartBadgeLabel(99)).toBe('99');
    expect(cartBadgeLabel(100)).toBe('99+');
  });
});
