import { AccessibilityInfo } from 'react-native';

// ─── Reduce-motion accessor ─────────────────────────────────────────────────

/**
 * Module-level flag updated by AccessibilityInfo listener.
 * Starts `false` (motion enabled); flips synchronously once the async query
 * resolves or the system setting changes at runtime.
 *
 * Usage: `if (prefersReducedMotion()) { ... skip animation ... }`
 */
let _reduceMotion = false;

// Hydrate on module load — result arrives async but typically before first animation frame.
AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
  _reduceMotion = enabled;
});

// Live listener — tracks runtime toggle (e.g. user enables in iOS Settings mid-session).
AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
  _reduceMotion = enabled;
});

/** Returns the current reduce-motion preference (synchronous read). */
export function prefersReducedMotion(): boolean {
  return _reduceMotion;
}

// ─── Duration tokens (ms) ───────────────────────────────────────────────────

export const koolaDurations = {
  /** Micro-interactions: button press feedback, icon swap */
  fast: 120,
  /** Standard transitions: fade, scale, slide */
  normal: 180,
  /** Navigation/modal transitions, complex choreography */
  slow: 280,
} as const;

// ─── Easing curves ──────────────────────────────────────────────────────────
// Cubic-bezier arrays compatible with Reanimated Easing.bezier() and
// React Native Animated Easing.bezier().

export const koolaEasing = {
  /** Standard ease-out for enter animations */
  decelerate: [0.0, 0.0, 0.2, 1.0] as const,
  /** Ease-in for exit animations */
  accelerate: [0.4, 0.0, 1.0, 1.0] as const,
  /** Standard ease-in-out for symmetric transitions */
  standard: [0.4, 0.0, 0.2, 1.0] as const,
} as const;

// ─── Spring configs ─────────────────────────────────────────────────────────
// For direct-manipulation gestures ONLY (zoom/pan/drag).
// Decorative spring/bounce on chrome elements is banned (see ui-dna.md).
// Compatible with Reanimated `withSpring(value, config)`.

export const koolaSprings = {
  /** Snappy response for pinch-to-zoom / drag release */
  responsive: { damping: 20, stiffness: 300, mass: 0.8 },
  /** Gentle settle for pan release, image viewer snap-back */
  gentle: { damping: 28, stiffness: 180, mass: 1.0 },
} as const;
