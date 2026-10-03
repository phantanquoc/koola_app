import { MMKV } from 'react-native-mmkv';
import type { ValidateResult } from '../api/apiService';

/**
 * Shopping cart — device-persisted external store (commerce-catalog D11).
 *
 * Storage:  MMKV instance id 'shopping-cart', one key per account:
 *           `cart:<activeAccountId>` → JSON `CartLine[]`.
 *           buyer info: `buyer:<activeAccountId>` → JSON `StoredBuyerInfo`.
 * Scope:    the ACTIVE account (personal or business). AuthContext calls
 *           `setAccount(id)` whenever the active account is resolved/switched
 *           and `clearAllAccounts()` on logout.
 */

export const CART_MAX_QTY = 99;
const MMKV_ID = 'shopping-cart';
const keyFor = (accountId: string) => `cart:${accountId}`;
const buyerKey = (accountId: string) => `buyer:${accountId}`;

export interface CartSnapshot {
  name: string;
  price: number;
  imageKey: string | null;
  seller: { id: string; displayName: string };
}

export interface CartLine {
  productId: string;
  quantity: number;
  snapshot: CartSnapshot;
  available: boolean;
  previousPrice: number | null;
  addedAt: number;
}

export interface StoredBuyerInfo {
  name: string;
  phone: string;
  address: string;
  note?: string;
}

let storage: MMKV | null = null;
function mmkv(): MMKV {
  if (!storage) storage = new MMKV({ id: MMKV_ID });
  return storage;
}

let accountId: string | null = null;
let lines: CartLine[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function clampQty(q: number): number {
  if (!Number.isFinite(q)) return 1;
  return Math.max(1, Math.min(CART_MAX_QTY, Math.floor(q)));
}

function isLine(v: unknown): v is CartLine {
  const l = v as CartLine;
  return (
    !!l &&
    typeof l.productId === 'string' &&
    typeof l.quantity === 'number' &&
    !!l.snapshot &&
    typeof l.snapshot.name === 'string' &&
    typeof l.snapshot.price === 'number' &&
    !!l.snapshot.seller &&
    typeof l.snapshot.seller.id === 'string'
  );
}

function load(id: string): CartLine[] {
  const raw = mmkv().getString(keyFor(id));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLine).map((l) => ({
      ...l,
      quantity: clampQty(l.quantity),
      available: l.available !== false,
      previousPrice: typeof l.previousPrice === 'number' ? l.previousPrice : null,
      snapshot: { ...l.snapshot, imageKey: l.snapshot.imageKey ?? null },
    }));
  } catch {
    return [];
  }
}

function commit(next: CartLine[]): void {
  lines = next;
  if (accountId) {
    if (next.length === 0) mmkv().delete(keyFor(accountId));
    else mmkv().set(keyFor(accountId), JSON.stringify(next));
  }
  notify();
}

export interface CartGroup {
  seller: { id: string; displayName: string };
  lines: CartLine[];
  subtotal: number;
  itemCount: number;
}

export function groupCartLines(input: CartLine[]): CartGroup[] {
  const groups = new Map<string, CartGroup>();
  for (const l of input) {
    let g = groups.get(l.snapshot.seller.id);
    if (!g) {
      g = { seller: l.snapshot.seller, lines: [], subtotal: 0, itemCount: 0 };
      groups.set(l.snapshot.seller.id, g);
    }
    g.lines.push(l);
    if (l.available) {
      g.subtotal += l.snapshot.price * l.quantity;
      g.itemCount += l.quantity;
    }
  }
  return Array.from(groups.values());
}

export function totalQuantityOf(input: CartLine[]): number {
  return input.reduce((s, l) => s + l.quantity, 0);
}

export const cartStore = {
  setAccount(id: string | null): void {
    if (id === accountId) return;
    accountId = id;
    lines = id ? load(id) : [];
    notify();
  },

  getAccount(): string | null {
    return accountId;
  },

  getLines(): CartLine[] {
    return lines;
  },

  getTotalQuantity(): number {
    return totalQuantityOf(lines);
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  add(productId: string, snapshot: CartSnapshot, qty = 1): boolean {
    if (!accountId) return false;
    const existing = lines.find((l) => l.productId === productId);
    if (existing) {
      commit(
        lines.map((l) =>
          l.productId === productId
            ? { ...l, quantity: clampQty(l.quantity + qty), snapshot: { ...snapshot }, available: true, previousPrice: null }
            : l,
        ),
      );
    } else {
      commit([
        ...lines,
        { productId, quantity: clampQty(qty), snapshot: { ...snapshot }, available: true, previousPrice: null, addedAt: Date.now() },
      ]);
    }
    return true;
  },

  setQty(productId: string, qty: number): void {
    const line = lines.find((l) => l.productId === productId);
    if (!line || line.quantity === clampQty(qty)) return;
    commit(lines.map((l) => (l.productId === productId ? { ...l, quantity: clampQty(qty) } : l)));
  },

  acknowledgePriceChange(productId: string): void {
    const line = lines.find((l) => l.productId === productId);
    if (!line || line.previousPrice === null) return;
    commit(lines.map((l) => (l.productId === productId ? { ...l, previousPrice: null } : l)));
  },

  remove(productId: string): void {
    if (!lines.some((l) => l.productId === productId)) return;
    commit(lines.filter((l) => l.productId !== productId));
  },

  applyValidation(results: ValidateResult[]): void {
    if (lines.length === 0 || results.length === 0) return;
    const byId = new Map(results.map((r) => [r.id, r]));
    let changed = false;
    const next = lines.map((l): CartLine => {
      const r = byId.get(l.productId);
      if (!r) return l;
      if (!r.available || r.price === null) {
        if (!l.available) return l;
        changed = true;
        return { ...l, available: false, previousPrice: null };
      }
      const priceChanged = r.price !== l.snapshot.price;
      const name = r.name ?? l.snapshot.name;
      const seller = r.seller ?? l.snapshot.seller;
      if (!priceChanged && l.available && name === l.snapshot.name && seller.displayName === l.snapshot.seller.displayName) return l;
      changed = true;
      return { ...l, available: true, previousPrice: priceChanged ? l.snapshot.price : l.previousPrice, snapshot: { ...l.snapshot, price: r.price, name, seller } };
    });
    if (changed) commit(next);
  },

  clear(): void {
    if (lines.length === 0) return;
    commit([]);
  },

  getLastBuyerInfo(): StoredBuyerInfo | null {
    if (!accountId) return null;
    const raw = mmkv().getString(buyerKey(accountId));
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as StoredBuyerInfo;
      if (typeof v.name === 'string' && typeof v.phone === 'string' && typeof v.address === 'string') return v;
      return null;
    } catch {
      return null;
    }
  },

  setLastBuyerInfo(info: StoredBuyerInfo): void {
    if (!accountId) return;
    mmkv().set(buyerKey(accountId), JSON.stringify(info));
  },

  removeSellerLines(sellerId: string): void {
    if (!accountId) return;
    const next = lines.filter((l) => l.snapshot.seller.id !== sellerId);
    if (next.length !== lines.length) commit(next);
  },

  clearAllAccounts(): void {
    mmkv().clearAll();
    accountId = null;
    lines = [];
    notify();
  },
};

export default cartStore;
