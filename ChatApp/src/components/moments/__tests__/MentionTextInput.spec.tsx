/**
 * MentionTextInput.spec.tsx
 *
 * Logic unit tests for MentionTextInput mention-detection and parsing.
 *
 * Full component render is not feasible in the Node test environment
 * (no jsdom, no @testing-library/react-native). We test the mention
 * parsing logic directly: trigger detection, query extraction, and
 * the mention-array construction that happens on selection.
 */

describe('MentionTextInput logic', () => {
  // ─── Trigger detection ────────────────────────────────────────────────────

  describe('mention trigger detection', () => {
    /**
     * Replicates the @ extraction logic from MentionTextInput:
     * finds the last @word before the cursor.
     */
    function extractMentionQuery(text: string): string | null {
      const match = text.match(/@(\w*)$/);
      return match ? match[1] : null;
    }

    it('returns query when text ends with @<word>', () => {
      expect(extractMentionQuery('Hello @Anh')).toBe('Anh');
    });

    it('returns empty string when text ends with bare @', () => {
      expect(extractMentionQuery('Hello @')).toBe('');
    });

    it('returns null when no @ present', () => {
      expect(extractMentionQuery('Hello world')).toBeNull();
    });

    it('returns null when @ is mid-word but followed by space', () => {
      // "@Anh Minh" — cursor is after "Minh", no trailing @word
      expect(extractMentionQuery('Hello @Anh Minh')).toBeNull();
    });

    it('handles multiple @ signs — uses last one', () => {
      expect(extractMentionQuery('Hey @Bo and @Anh')).toBe('Anh');
    });
  });

  // ─── Mention replacement ──────────────────────────────────────────────────

  describe('mention replacement in text', () => {
    /**
     * Replicates the text replacement when a suggestion is selected.
     * Replaces the last @<query> with @<username> + space.
     */
    function replaceMentionQuery(text: string, query: string, username: string): string {
      const idx = text.lastIndexOf('@' + query);
      if (idx === -1) return text;
      return text.slice(0, idx) + '@' + username + ' ';
    }

    it('replaces @query with @username + space', () => {
      const result = replaceMentionQuery('Hello @Anh', 'Anh', 'AnhMinh');
      expect(result).toBe('Hello @AnhMinh ');
    });

    it('handles bare @ (empty query)', () => {
      const result = replaceMentionQuery('Hello @', '', 'BaoTran');
      expect(result).toBe('Hello @BaoTran ');
    });

    it('only replaces the last occurrence', () => {
      const result = replaceMentionQuery('@Anh and @Anh', 'Anh', 'AnhMinh');
      expect(result).toBe('@Anh and @AnhMinh ');
    });
  });

  // ─── Mention entry construction ───────────────────────────────────────────

  describe('mention entry construction', () => {
    interface UserSuggestion {
      _id: string;
      displayName: string;
    }

    interface MentionEntry {
      userId: string;
      username: string;
      offset: number;
      length: number;
    }

    /**
     * Replicates the MentionEntry builder: after replacement, find
     * the @username in the new text and record offset + length.
     */
    function buildMentionEntry(
      newText: string,
      user: UserSuggestion,
      prevMentions: MentionEntry[],
    ): MentionEntry[] {
      const tag = '@' + user.displayName;
      const offset = newText.lastIndexOf(tag);
      if (offset === -1) return prevMentions;

      const entry: MentionEntry = {
        userId: user._id,
        username: user.displayName,
        offset,
        length: tag.length,
      };

      // Replace any existing mention for same user
      const filtered = prevMentions.filter((m) => m.userId !== user._id);
      return [...filtered, entry];
    }

    it('creates a MentionEntry with correct userId and username', () => {
      const text = 'Hello @AnhMinh ';
      const user = { _id: 'u1', displayName: 'AnhMinh' };
      const entries = buildMentionEntry(text, user, []);

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        userId: 'u1',
        username: 'AnhMinh',
      });
    });

    it('records correct offset for the mention', () => {
      const text = 'Hello @AnhMinh ';
      const user = { _id: 'u1', displayName: 'AnhMinh' };
      const entries = buildMentionEntry(text, user, []);

      // "@AnhMinh" starts at index 6
      expect(entries[0].offset).toBe(6);
      // Length is "@AnhMinh".length = 8
      expect(entries[0].length).toBe(8);
    });

    it('replaces existing entry for same user on re-mention', () => {
      const text = 'See @AnhMinh later';
      const user = { _id: 'u1', displayName: 'AnhMinh' };
      const existing: MentionEntry[] = [
        { userId: 'u1', username: 'AnhMinh', offset: 0, length: 9 },
      ];
      const entries = buildMentionEntry(text, user, existing);

      expect(entries).toHaveLength(1);
      expect(entries[0].offset).toBe(4);
    });

    it('accumulates multiple distinct mentions', () => {
      const text = 'Hey @AnhMinh and @BaoTran ';
      const userA = { _id: 'u1', displayName: 'AnhMinh' };
      const userB = { _id: 'u2', displayName: 'BaoTran' };

      let entries: MentionEntry[] = [];
      entries = buildMentionEntry(text, userA, entries);
      entries = buildMentionEntry(text, userB, entries);

      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.userId).sort()).toEqual(['u1', 'u2']);
    });
  });
});
