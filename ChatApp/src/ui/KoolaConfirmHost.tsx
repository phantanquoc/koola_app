import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { KoolaText } from './KoolaText';
import { useTheme } from './ThemeProvider';
import { koolaOpacity, koolaRadii, koolaSpacing } from './theme';
import type { SemanticTokens } from './tokens/semantic';

// App-root confirm dialog rendered as an in-tree absolute overlay instead of
// react-native <Modal>. On RN 0.76 Fabric/Android the Modal's dialog window can
// measure before its state wrapper is attached, so the screen size is never
// sent and all content lays out 0x0 inside a full-screen window that still
// swallows touches (looks frozen; upstream facebook/react-native#50704, fix
// #51048 not in our prebuilt react-android). Same fix as QrScannerModal.

export interface KoolaConfirmOptions {
  title: string;
  message?: string;
  /** Visible label, e.g. "ĐĂNG XUẤT". Screen readers get a sentence-case form. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger-coloured confirm action (logout, delete…). */
  destructive?: boolean;
  onConfirm: () => void;
  /** Called on HỦY, backdrop tap, hardware Back, or when replaced by a newer request. */
  onCancel?: () => void;
}

interface ConfirmRequest extends KoolaConfirmOptions {
  id: number;
}

// ─── Module-level store (one active request, many subscribers = hosts) ──────

let current: ConfirmRequest | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return current;
}

/** Resolve the request with `id` (no-op if it is no longer current — double-tap guard). */
function settle(id: number, confirmed: boolean) {
  const req = current;
  if (!req || req.id !== id) return;
  // Clear first so the dialog is hidden even if the callback throws or
  // unmounts the tree (logout teardown).
  current = null;
  emit();
  if (confirmed) req.onConfirm();
  else req.onCancel?.();
}

/**
 * Show the shared confirm dialog. A newer request replaces an open one; the
 * replaced request is treated as cancelled.
 *
 * If no <KoolaConfirmHost /> is mounted the request cannot be shown: it is
 * cancelled immediately (onCancel, never onConfirm) and warns in __DEV__.
 * Never queued — a stale dialog popping up later would be worse.
 */
export function koolaConfirm(options: KoolaConfirmOptions): void {
  if (listeners.size === 0) {
    if (__DEV__) {
      console.warn('[koolaConfirm] No KoolaConfirmHost mounted; request cancelled.');
    }
    options.onCancel?.();
    return;
  }
  const previous = current;
  current = { ...options, id: nextId++ };
  emit();
  previous?.onCancel?.();
}

/** Close any open dialog as cancelled (e.g. test teardown). */
export function dismissKoolaConfirm(): void {
  if (current) settle(current.id, false);
}

function toSentenceCase(label: string) {
  return label.charAt(0) + label.slice(1).toLowerCase();
}

// ─── Host ────────────────────────────────────────────────────────────────────

/** Mount once at the app root, above navigation. Renders null when idle. */
export const KoolaConfirmHost: React.FC = () => {
  const request = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens.semantic), [tokens.semantic]);
  const cardRef = useRef<View>(null);
  const requestId = request?.id;

  useEffect(() => {
    if (requestId === undefined) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      settle(requestId, false);
      return true;
    });
    // Android has no accessibilityViewIsModal; move TalkBack focus into the card.
    if (cardRef.current) AccessibilityInfo.sendAccessibilityEvent(cardRef.current, 'focus');
    return () => sub.remove();
  }, [requestId]);

  if (!request) return null;

  const { id, title, message, destructive, confirmLabel = 'ĐỒNG Ý', cancelLabel = 'HỦY' } = request;

  // accessibilityViewIsModal on the root overlay hides its siblings (the whole
  // navigation tree) from VoiceOver; on Android the overlay is top-most for
  // explore-by-touch and focus is moved into the card in the effect above.
  return (
    <View style={styles.overlay} accessibilityViewIsModal importantForAccessibility="yes">
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => settle(id, false)}
        accessibilityRole="button"
        accessibilityLabel="Đóng hộp thoại"
      />
      <View
        ref={cardRef}
        style={styles.dialog}
        onStartShouldSetResponder={() => true}
        accessibilityRole="alert">
        <KoolaText variant="heading" weight="700" style={styles.title}>{title}</KoolaText>
        {message ? <KoolaText variant="body" style={styles.message}>{message}</KoolaText> : null}
        <View style={styles.actions}>
          <Pressable onPress={() => settle(id, false)} accessibilityRole="button" accessibilityLabel={toSentenceCase(cancelLabel)} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
            <KoolaText variant="label" weight="700" style={styles.cancel}>{cancelLabel}</KoolaText>
          </Pressable>
          <Pressable onPress={() => settle(id, true)} accessibilityRole="button" accessibilityLabel={toSentenceCase(confirmLabel)} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
            <KoolaText variant="label" weight="800" style={destructive ? styles.confirmDanger : styles.confirm}>{confirmLabel}</KoolaText>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

function makeStyles(semantic: SemanticTokens) {
  return StyleSheet.create({
    // Above NotchHeader (zIndex 10) and the floating tab dock (zIndex 20).
    overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: koolaSpacing.xl },
    dialog: { width: '100%', maxWidth: 340, backgroundColor: semantic.surface.level1, borderRadius: koolaRadii.lg, padding: koolaSpacing.lg, elevation: 8, shadowColor: semantic.text.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16 },
    title: { color: semantic.text.primary, marginBottom: koolaSpacing.sm },
    message: { color: semantic.text.muted },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: koolaSpacing.md, marginTop: koolaSpacing.lg },
    btn: { paddingHorizontal: koolaSpacing.md, paddingVertical: koolaSpacing.sm },
    pressed: { opacity: koolaOpacity.pressed },
    cancel: { color: semantic.text.muted },
    confirm: { color: semantic.action.primary },
    confirmDanger: { color: semantic.status.danger },
  });
}
