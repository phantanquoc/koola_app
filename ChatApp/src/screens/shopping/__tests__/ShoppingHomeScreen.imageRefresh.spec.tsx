/**
 * Home product-card image refresh (commerce-catalog-live design D6).
 *
 * Presigned image URLs expire (≈1h). The PDP refetches product detail once on
 * image error; the home card must do the same instead of jumping straight to
 * the glyph fallback — a stale list URL would otherwise stay a glyph until
 * pull-to-refresh. A static-source guard (repo screen-test pattern, e.g.
 * MomentsScreen.spec.tsx) keeps this test independent of navigation/RN mocks.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('ShoppingHomeScreen - card image refresh-on-error (D6)', () => {
  const sourcePath = path.resolve(__dirname, '../ShoppingHomeScreen.tsx');
  const source = fs.readFileSync(sourcePath, 'utf8');

  it('fetches a fresh URL once via commerceApi.getProduct on image error', () => {
    expect(source).toMatch(/commerceApi\.getProduct\(item\.id\)/);
    expect(source).toMatch(/imageRefreshedRef/);
  });

  it('updates the card image from the refetched detail instead of glyphing immediately', () => {
    expect(source).toMatch(/setImageUrl\(detail\.imageUrls\[0\]\)/);
  });

  it('falls back to the glyph only when the refetch fails or repeats', () => {
    expect(source).toMatch(/setImageUrl\(null\)/);
    // The refreshed URL drives the rendered Image, not the stale list prop.
    expect(source).toMatch(/source=\{\{ uri: imageUrl as string \}\}/);
  });
});
