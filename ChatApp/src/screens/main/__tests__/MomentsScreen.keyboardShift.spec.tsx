/**
 * MomentsScreen.keyboardShift.spec.tsx — regression guard for the comment
 * sheet keyboard shift (Android).
 *
 * THE DEFECT THIS GUARDS
 * The app window is edge-to-edge (MainActivity clears
 * decorFitsSystemWindows), so the manifest's `adjustResize` is a no-op and the
 * soft keyboard arrives only as a window inset. ChatScreen compensates
 * manually via useReanimatedKeyboardAnimation() (ChatScreen.tsx + the composer
 * dock translate by keyboard.height.value). The Moments comment bottom-sheet
 * (Modal presentationStyle="pageSheet") had zero keyboard handling — a plain
 * View + FlatList + input row — so on Android the keyboard floated over the
 * comment TextInput and the user typed blind.
 *
 * WHAT THIS FILE PROVES, AND HOW
 * MomentsScreen cannot be rendered cheaply in jest (feed + service + Modal
 * chain), so like ChatScreen.keyboardShift.spec.tsx §3 this is source
 * analysis, scoped to the one object under test: the sheet must derive its
 * shift from the live keyboard animated value on the UI thread, apply it to
 * the container that owns the input row + reply banner, Android-only, and
 * never fall back to KeyboardAvoidingView (a documented no-op on Android
 * under edge-to-edge — see AuthFormShell).
 */

import fs from 'fs';
import path from 'path';

const SRC_ROOT = path.join(__dirname, '..', '..', '..');
const source = fs.readFileSync(path.join(SRC_ROOT, 'screens/main/MomentsScreen.tsx'), 'utf8');

describe('MomentsScreen shifts the comment sheet with the keyboard', () => {
  it('derives the shift from the live keyboard value on the UI thread', () => {
    // useReanimatedKeyboardAnimation + useAnimatedStyle keep this a worklet:
    // no JS re-render per keyboard frame. A hardcoded height would break on
    // every device whose keyboard is not exactly that tall.
    expect(source).toMatch(
      /import \{ useReanimatedKeyboardAnimation \} from 'react-native-keyboard-controller'/,
    );
    expect(source).toMatch(/const keyboard = useReanimatedKeyboardAnimation\(\);/);
    expect(source).toMatch(/const sheetShiftStyle = useAnimatedStyle\(\(\) => \(\{/);
    expect(source).toMatch(/transform: \[\{ translateY: keyboard\.height\.value \}\]/);
  });

  it('uses the live animated value, never a hardcoded keyboard height', () => {
    const styleBody = source.slice(
      source.indexOf('const sheetShiftStyle = useAnimatedStyle'),
      source.indexOf('}));', source.indexOf('const sheetShiftStyle = useAnimatedStyle')) + 3,
    );
    expect(styleBody).not.toMatch(/translateY: -?\d/);
    expect(styleBody).not.toMatch(/translateY: [A-Z_]+/);
  });

  it('keeps Platform out of the worklet', () => {
    // Reading Platform.OS inside the animated style would hand the UI thread
    // a module lookup on every keyboard frame (same rule as ChatScreen's
    // listShiftStyle).
    const styleBody = source.slice(
      source.indexOf('const sheetShiftStyle = useAnimatedStyle'),
      source.indexOf('}));', source.indexOf('const sheetShiftStyle = useAnimatedStyle')) + 3,
    );
    expect(styleBody).not.toMatch(/Platform/);
  });

  it('applies the shift to the whole sheet container, Android only', () => {
    // The container owns the list, the reply banner, AND the input row, so
    // one shift moves all three together — the banner stays glued to the
    // input, and empty/loading states shift too (the shift is not gated on
    // list content). iOS pageSheet avoids the keyboard natively; shifting
    // there as well would move the sheet twice.
    expect(source).toMatch(
      /<Animated\.View style=\{\[styles\.sheet, Platform\.OS === 'android' && sheetShiftStyle\]\}>/,
    );
    expect(source).toMatch(/<\/Animated\.View>\s*\n\s*<\/Modal>/);
  });

  it('keeps the reply banner and input row inside the shifted container', () => {
    const open = source.indexOf(
      `<Animated.View style={[styles.sheet, Platform.OS === 'android' && sheetShiftStyle]}>`,
    );
    const close = source.indexOf('</Animated.View>', open);
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    const sheetBody = source.slice(open, close);
    expect(sheetBody).toMatch(/styles\.replyBanner/);
    expect(sheetBody).toMatch(/styles\.commentInputRow/);
  });

  it('never uses KeyboardAvoidingView for the sheet', () => {
    // No-op on Android under edge-to-edge; the animated translate above is
    // the mechanism, and adding KAV would double-shift on the platforms
    // where it does act.
    expect(source).not.toMatch(/<KeyboardAvoidingView/);
    expect(source).not.toMatch(/import[^;]*KeyboardAvoidingView/);
  });
});
