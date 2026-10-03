/**
 * Client-side product validation must mirror the server rules
 * (commerce-catalog spec "Product data model" + admin DTOs).
 */
import { describe, it, expect } from 'vitest';
import { parseTags, validateProductPayload, type ProductWritePayload } from '../commerceApi';

const valid = (): ProductWritePayload => ({
  name: 'Gạo ST25',
  description: '',
  price: 100000,
  originalPrice: null,
  imageKeys: [],
  category: 'grocery',
  tags: [],
  deliveryText: '',
  active: true,
  sellerId: 'a'.repeat(24),
});

describe('validateProductPayload', () => {
  it('accepts a valid payload', () => {
    expect(validateProductPayload(valid())).toEqual({});
  });

  it('rejects originalPrice <= price', () => {
    expect(validateProductPayload({ ...valid(), originalPrice: 100000 }).originalPrice).toBeTruthy();
    expect(validateProductPayload({ ...valid(), originalPrice: 99999 }).originalPrice).toBeTruthy();
    expect(validateProductPayload({ ...valid(), originalPrice: 100001 }).originalPrice).toBeUndefined();
  });

  it('requires an integer non-negative price', () => {
    expect(validateProductPayload({ ...valid(), price: -1 }).price).toBeTruthy();
    expect(validateProductPayload({ ...valid(), price: 10.5 }).price).toBeTruthy();
    expect(validateProductPayload({ ...valid(), price: 0 }).price).toBeUndefined();
  });

  it('enforces name, tags, images, delivery and seller limits', () => {
    expect(validateProductPayload({ ...valid(), name: '  ' }).name).toBeTruthy();
    expect(validateProductPayload({ ...valid(), name: 'x'.repeat(201) }).name).toBeTruthy();
    expect(validateProductPayload({ ...valid(), tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).tags).toBeTruthy();
    expect(validateProductPayload({ ...valid(), tags: ['x'.repeat(41)] }).tags).toBeTruthy();
    expect(validateProductPayload({ ...valid(), imageKeys: Array.from({ length: 9 }, (_, i) => `k${i}`) }).imageKeys).toBeTruthy();
    expect(validateProductPayload({ ...valid(), deliveryText: 'x'.repeat(101) }).deliveryText).toBeTruthy();
    expect(validateProductPayload({ ...valid(), description: 'x'.repeat(2001) }).description).toBeTruthy();
    expect(validateProductPayload({ ...valid(), sellerId: '' }).sellerId).toBeTruthy();
    expect(validateProductPayload({ ...valid(), sellerId: 'seller-fresh' }).sellerId).toBeTruthy();
  });

  it('rejects an unknown category', () => {
    expect(
      validateProductPayload({ ...valid(), category: 'general' as ProductWritePayload['category'] }).category,
    ).toBeTruthy();
  });
});

describe('parseTags', () => {
  it('trims, drops empties and dedupes', () => {
    expect(parseTags(' Organic, Chính hãng ,, Organic ,')).toEqual(['Organic', 'Chính hãng']);
    expect(parseTags('')).toEqual([]);
  });
});
