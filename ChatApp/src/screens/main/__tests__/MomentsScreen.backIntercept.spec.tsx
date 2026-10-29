/**
 * MomentsScreen.backIntercept.spec.tsx — regression guard for the comment
 * sheet hardware-Back freeze (Android).
 *
 * THE DEFECT THIS GUARDS
 * The app routes system Back through a custom native flow (MainActivity
 * OnBackPressedDispatcher + services/nativeBack.ts): native only delegates
 * Back to JS while some party holds an intercept via acquireBackIntercept().
 * Every modal/overlay follows this contract — QrScannerModal, KoolaConfirmHost
 * and useChatHomeOverlay all register a hardwareBackPress listener AND hold
 * acquireBackIntercept(), releasing both on cleanup. The Moments comment
 * bottom-sheet (Modal presentationStyle="pageSheet") was the sole exception:
 * no BackHandler, no intercept. So system Back ran the native card
 * shrink/nav-pop flow while the Modal's dialog window was open; the leaked
 * window kept focus and swallowed every touch afterwards — like, comment and
 * tab switches all dead. The "Đóng" button is pure JS (closeComments), so it
 * always closed cleanly, and the key={sheetEpoch} remount cannot save a
 * native-window leak mid-nav-transition.
 *
 * WHAT THIS FILE PROVES, AND HOW
 * MomentsScreen cannot be rendered cheaply in jest (feed + service + Modal
 * chain), so like MomentsScreen.keyboardShift.spec.tsx this is source
 * analysis, scoped to the one object under test: the sheet must hold a
 * hardwareBackPress listener AND an acquireBackIntercept() lease for exactly
 * the open window, closeComments must be idempotent against the
 * onRequestClose + BackHandler dual-fire, and no other screen's back handling
 * may be touched by this change.
 */

import fs from 'fs';
import path from 'path';

const SRC_ROOT = path.join(__dirname, '..', '..', '..');
const source = fs.readFileSync(path.join(SRC_ROOT, 'screens/main/MomentsScreen.tsx'), 'utf8');

describe('MomentsScreen holds the back-intercept contract while the comment sheet is open', () => {
  it('registers a hardwareBackPress listener scoped to the open sheet', () => {
    // Gated on commentPostId !== null so the listener exists only while the
    // sheet is open; returns true so the press is consumed and never reaches
    // the native card shrink/nav-pop flow.
    expect(source).toMatch(
      /if \(commentPostId === null\) return undefined;\s*\n\s*const sub = BackHandler\.addEventListener\('hardwareBackPress', \(\) => \{\s*\n\s*closeComments\(\);\s*\n\s*return true;\s*\n\s*\}\);/,
    );
  });

  it('holds acquireBackIntercept() in the same effect and releases both on cleanup', () => {
    // Listener + lease are acquired together and torn down together — the
    // QrScannerModal pattern exactly. The cleanup also runs on
    // unmount-with-sheet-open, so native never delegates Back to a dead JS
    // side. Release is idempotent in nativeBack.ts, safe against double-run.
    expect(source).toMatch(/const releaseIntercept = acquireBackIntercept\(\);/);
    expect(source).toMatch(/return \(\) => \{\s*\n\s*sub\.remove\(\);\s*\n\s*releaseIntercept\(\);/);
    expect(source).toMatch(
      /import \{ acquireBackIntercept \} from '\.\.\/\.\.\/services\/nativeBack';/,
    );
  });

  it('makes closeComments idempotent against the onRequestClose + BackHandler dual-fire', () => {
    // Android delivers BOTH Modal.onRequestClose AND the JS listener for one
    // system-Back press. A ref guard (not state — closeComments is a stable
    // useCallback([])) absorbs the second fire so sheetEpoch bumps at most
    // once per open; a double bump would remount the Modal window twice and
    // re-open the leaked-window race.
    expect(source).toMatch(/const sheetOpenRef = useRef\(false\);/);
    expect(source).toMatch(/if \(!sheetOpenRef\.current\) return;/);
    expect(source).toMatch(/sheetOpenRef\.current = true;/);
    expect(source).toMatch(/sheetOpenRef\.current = false;/);
  });

  it('documents the keyboard-open Back ordering instead of changing keyboard behavior', () => {
    // One press closes the sheet outright (same as QrScannerModal — no
    // overlay owner dismisses keyboard first); the keyboard belongs to the
    // sheet window so it dismisses as a side effect. The keyboard-shift
    // mechanism (sheetShiftStyle) must be untouched by this change.
    expect(source).toMatch(/Keyboard ordering/);
    expect(source).toMatch(/const sheetShiftStyle = useAnimatedStyle\(\(\) => \(\{/);
    expect(source).not.toMatch(/Keyboard\.dismiss/);
  });

  it('does not touch any other screen back handling', () => {
    // Scoped change: only MomentsScreen.tsx may reference the comment-sheet
    // back wiring. QrScannerModal, KoolaConfirmHost and useChatHomeOverlay
    // keep their own listeners untouched.
    const qr = fs.readFileSync(
      path.join(SRC_ROOT, 'screens/main/QrScannerModal.tsx'),
      'utf8',
    );
    expect(qr).toMatch(/const releaseIntercept = acquireBackIntercept\(\);/);
    const confirm = fs.readFileSync(path.join(SRC_ROOT, 'ui/KoolaConfirmHost.tsx'), 'utf8');
    expect(confirm).toMatch(/const releaseIntercept = acquireBackIntercept\(\);/);
    const overlay = fs.readFileSync(
      path.join(SRC_ROOT, 'screens/main/useChatHomeOverlay.ts'),
      'utf8',
    );
    expect(overlay).toMatch(/const releaseIntercept = acquireBackIntercept\(\);/);
    // The new effect gates on this screen's own sheet state — it cannot fire
    // for any other screen's overlays.
    expect(source).toMatch(/\}, \[commentPostId, closeComments\]\);/);
  });
});
