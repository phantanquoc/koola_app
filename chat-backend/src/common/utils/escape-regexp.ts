/**
 * Escape a user-provided string so it can be safely used inside new RegExp().
 * Escapes: . * + ? ^ $ { } ( ) | [ ] \
 */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
