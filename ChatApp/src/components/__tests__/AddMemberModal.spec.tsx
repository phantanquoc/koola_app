/**
 * AddMemberModal.spec.tsx
 *
 * Contract verification for AddMemberModal component.
 * Uses source-analysis pattern (same as AccountListScreen.spec.tsx) since
 * react-test-renderer requires too many native module mocks for a full Modal.
 *
 * Validates:
 * 1. Exclusion of self and existing members from search results
 * 2. Duplicate submit prevention (submitting guard)
 * 3. Selection preserved on failure (no resetState in catch)
 * 4. Vietnamese error messages (no English strings in user-facing text)
 * 5. Debounced search (setTimeout pattern)
 */
import * as fs from 'fs';
import * as path from 'path';

describe('AddMemberModal — Contract', () => {
  const sourcePath = path.resolve(__dirname, '../AddMemberModal.tsx');
  const source = fs.readFileSync(sourcePath, 'utf8');

  describe('exclusion logic', () => {
    it('builds exclusion set from existingMemberIds + currentUserId', () => {
      expect(source).toMatch(/new Set\(\[\.\.\.existingMemberIds,\s*currentUserId\]\)/);
    });

    it('filters results by excludeIds', () => {
      expect(source).toMatch(/\.filter\(\(u\)\s*=>\s*!excludeIds\.has\(u\._id\)\)/);
    });
  });

  describe('duplicate submit prevention', () => {
    it('guards handleSubmit with submitting flag', () => {
      // Must check both: empty selection AND submitting state
      expect(source).toMatch(/selectedUsers\.length\s*===\s*0\s*\|\|\s*submitting/);
    });

    it('sets submitting=true before calling onAdd', () => {
      // setSubmitting(true) must come before onAdd call
      const submitIdx = source.indexOf('setSubmitting(true)');
      const onAddIdx = source.indexOf('await onAdd(');
      expect(submitIdx).toBeGreaterThan(-1);
      expect(onAddIdx).toBeGreaterThan(submitIdx);
    });

    it('blocks close while submitting', () => {
      expect(source).toMatch(/if\s*\(submitting\)\s*return/);
    });
  });

  describe('selection preserved on failure', () => {
    it('does NOT call resetState in the catch block', () => {
      // Extract the catch block of handleSubmit
      const catchMatch = source.match(/catch\s*\(err[^)]*\)\s*\{([^}]*)\}/);
      expect(catchMatch).not.toBeNull();
      expect(catchMatch![1]).not.toContain('resetState');
      expect(catchMatch![1]).not.toContain('setSelectedUsers');
    });

    it('only calls resetState on success (inside try before onClose)', () => {
      // resetState() followed by onClose() in the success path
      const tryBlock = source.match(/try\s*\{([\s\S]*?)\}\s*catch/);
      expect(tryBlock).not.toBeNull();
      expect(tryBlock![1]).toContain('resetState()');
      expect(tryBlock![1]).toContain('onClose()');
    });
  });

  describe('Vietnamese error messages', () => {
    it('uses Vietnamese for search error fallback', () => {
      expect(source).toContain('Không tìm kiếm được');
    });

    it('uses Vietnamese for submit error fallback', () => {
      expect(source).toContain('Không thể thêm thành viên');
    });

    it('does NOT contain English-only user-facing error strings', () => {
      // Common English patterns that should NOT appear
      expect(source).not.toMatch(/'Search failed/);
      expect(source).not.toMatch(/'Failed to add/);
      expect(source).not.toMatch(/'Error adding/);
    });
  });

  describe('debounced search', () => {
    it('uses setTimeout for debounce', () => {
      expect(source).toMatch(/setTimeout\(/);
    });

    it('cleans up timer on unmount/re-run', () => {
      expect(source).toMatch(/clearTimeout\(/);
    });

    it('has a minimum query length check', () => {
      expect(source).toContain('SEARCH_MIN_LENGTH');
    });
  });
});
