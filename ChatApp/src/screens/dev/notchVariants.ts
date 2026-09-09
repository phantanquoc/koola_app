import AsyncStorage from '@react-native-async-storage/async-storage';

export type NotchPresetId = 'original' | 'B' | 'current' | 'flat';

export interface NotchPreset {
  id: NotchPresetId;
  label: string;
  subtitle: string;
  /** When true, renders a plain rectangular bar — no notch protrusion, no shadow */
  flat?: boolean;
  tabWidth: number;
  tabDrop: number;
  fillet: number;
  dyFactor: number;
  hx: number;   // handle x factor at wing/bottom (0.42 soft, 0.55 crisp)
  hy: number;   // handle y inner (0.06 soft, 0.08 crisp)
  bottomHx: number; // separate bottom outer handle for pill tuning
  shadowStd: number;
  highlightOpacity: number;
  highlightStrong: boolean;
}

export const NOTCH_PRESETS: Record<NotchPresetId, NotchPreset> = {
  original: {
    id: 'original',
    label: 'Mẫu gốc (ban đầu)',
    subtitle: 'W 180 · Drop 30 · Fillet 26 · cong mềm ban đầu',
    tabWidth: 180, tabDrop: 30, fillet: 26, dyFactor: 0.12, hx: 0.55, hy: 0.08, bottomHx: 0.55, shadowStd: 8, highlightOpacity: 0, highlightStrong: false,
  },
  B: {
    id: 'B',
    label: 'Mẫu B — S-curve + highlight',
    subtitle: 'W 132 · Drop 22 · Fillet 22 · highlight rõ, S mềm nhất',
    tabWidth: 132, tabDrop: 22, fillet: 22, dyFactor: 0.06, hx: 0.42, hy: 0.06, bottomHx: 0.42, shadowStd: 10, highlightOpacity: 0.85, highlightStrong: true,
  },
  current: {
    id: 'current',
    label: 'Mẫu A (đang dùng) — Pill cân bằng',
    subtitle: 'W 132 · Drop 22 · Fillet 22 · bottom 0.44, mềm vừa',
    tabWidth: 132, tabDrop: 22, fillet: 22, dyFactor: 0.06, hx: 0.42, hy: 0.06, bottomHx: 0.44, shadowStd: 10, highlightOpacity: 0.7, highlightStrong: false,
  },
  flat: {
    id: 'flat',
    label: 'Flat — hộp thường, không notch',
    subtitle: 'Thanh chữ nhật phẳng, không phần nhô, không đổ bóng',
    flat: true,
    tabWidth: 0, tabDrop: 0, fillet: 0, dyFactor: 0, hx: 0, hy: 0, bottomHx: 0, shadowStd: 0, highlightOpacity: 0, highlightStrong: false,
  },
};

const STORAGE_KEY = 'dev:notchPreset';

let cached: NotchPresetId | null = null;
const listeners = new Set<() => void>();
let hydrated = false;

export function getNotchPreset(): NotchPresetId {
  if (!hydrated) { hydrate(); return cached ?? 'current'; }
  return cached ?? 'current';
}

export async function setNotchPreset(id: NotchPresetId) {
  cached = id;
  try { await AsyncStorage.setItem(STORAGE_KEY, id); } catch {}
  listeners.forEach((l) => l());
}

export function subscribeNotchPreset(cb: () => void): () => void {
  listeners.add(cb);
  if (!hydrated) hydrate();
  return () => listeners.delete(cb);
}

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    if (v === 'original' || v === 'B' || v === 'current' || v === 'flat') cached = v as NotchPresetId;
    else cached = 'current';
  } catch { cached = 'current'; }
  listeners.forEach((l) => l());
}
