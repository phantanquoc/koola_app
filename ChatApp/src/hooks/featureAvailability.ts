/**
 * Feature availability model.
 *
 * Every user-facing feature in the mobile app declares one of three states:
 *   - ready:       backed by a real, transactional workflow
 *   - preview:     sample data only — no durable operations succeed
 *   - unavailable: no meaningful preview or real action exists
 *
 * Surface components use this to decide presentation (preview banner,
 * disabled controls) without scattering ad-hoc booleans.
 */

export type FeatureAvailability = 'ready' | 'preview' | 'unavailable';

/** Exhaustive list of feature keys managed by the registry. */
export type FeatureKey =
  | 'chat'
  | 'calls'
  | 'contacts'
  | 'moments'
  | 'auth'
  | 'shopping'
  | 'services'
  | 'shorts'
  | 'emojiPicker'
  | 'voiceMessage';

/**
 * Static registry of feature availability.
 * Update this as backend modules are shipped.
 */
export const FEATURE_AVAILABILITY: Record<FeatureKey, FeatureAvailability> = {
  // ── Ready features ──────────────────────────────────────────────────────
  chat: 'ready',
  calls: 'ready',
  contacts: 'ready',
  moments: 'ready',
  auth: 'ready',

  // ── Preview features (mock data, no backend) ────────────────────────────
  shorts: 'preview',

  // ── Ready after commerce catalog ships ────────────────────────────────────
  shopping: 'ready',
  services: 'ready',

  // ── Unavailable features ────────────────────────────────────────────────
  emojiPicker: 'unavailable',
  voiceMessage: 'unavailable',
};

/** User-facing Vietnamese labels for each state. */
export const AVAILABILITY_LABELS: Record<FeatureAvailability, string> = {
  ready: 'Sẵn sàng',
  preview: 'Bản xem trước',
  unavailable: 'Đang phát triển',
};

/** Returns the availability status for a given feature key. */
export function getFeatureAvailability(feature: FeatureKey): FeatureAvailability {
  return FEATURE_AVAILABILITY[feature] ?? 'unavailable';
}

/**
 * Guard: returns true if the feature is in preview mode.
 * Use in UI surfaces to block durable operations on preview features.
 */
export function isPreview(feature: FeatureKey): boolean {
  return getFeatureAvailability(feature) === 'preview';
}
