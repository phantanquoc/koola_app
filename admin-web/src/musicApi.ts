/**
 * Music catalog client types + API helpers (change `music-catalog-ops`).
 *
 * Backend contract quirks worth knowing before editing this file:
 * - The list returns NO presigned URLs on purpose — a 20-row page must not fire
 *   40 signing operations. Playback URLs come from `GET /:id` on demand.
 * - `durationMs` is derived server-side; the create body must not include it.
 * - Export returns `{ data, total, truncated }` JSON, matching the existing
 *   `/admin/conversations/export` contract; the CSV file is built here.
 */
import apiClient from './apiClient';
import { mediaAdminApi } from './commerceApi';

export interface MusicTrack {
  _id: string;
  title: string;
  artist: string;
  durationMs: number;
  audioKey: string;
  previewKey: string;
  licenseType: string;
  licenseUrl: string;
  sourceUrl: string;
  attribution: string;
  addedBy: string;
  addedAt: string;
  isActive: boolean;
  usageCount: number;
  tags: string[];
}

/** Detail read adds freshly signed playback URLs; the list never carries them. */
export interface MusicTrackDetail extends MusicTrack {
  audioUrl: string;
  previewUrl: string;
  /** Live content still pointing at this track — what "Ngưng" would affect. */
  usage?: { stories: number; posts: number; total: number };
}

export interface MusicStats {
  all: number;
  active: number;
  inactive: number;
  byLicense: Record<string, number>;
}

export interface MusicListResult {
  data: MusicTrack[];
  total: number;
  page: number;
  limit: number;
}

export interface MusicExportResult {
  data: MusicTrack[];
  total: number;
  truncated: boolean;
}

export const LICENSE_LABELS: Record<string, string> = {
  cc0: 'CC0',
  'cc-by': 'CC-BY',
  'epidemic-sound': 'Epidemic Sound',
  'owned-by-koola': 'Nội bộ Koola',
};

export function licenseLabel(value: string): string {
  return LICENSE_LABELS[value] ?? value;
}

/** 214000 → "3:34". Friends think in minutes:seconds, not milliseconds. */
export function durationLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export const LICENSE_OPTIONS = Object.entries(LICENSE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const MUSIC_STATUS_OPTIONS = [
  { key: 'active', label: 'Đang dùng' },
  { key: 'inactive', label: 'Đã ngưng' },
  { key: 'all', label: 'Tất cả' },
] as const;

// ─── API ─────────────────────────────────────────────────────────────────────

export const musicApi = {
  async list(params: {
    status?: string;
    q?: string;
    licenseType?: string;
    sort?: string;
    page?: number;
    limit?: number;
  }): Promise<MusicListResult> {
    const { data } = await apiClient.get<MusicListResult>('/admin/music-tracks', { params });
    return data;
  },

  async stats(): Promise<MusicStats> {
    const { data } = await apiClient.get<MusicStats>('/admin/music-tracks/stats');
    return data;
  },

  async detail(id: string): Promise<MusicTrackDetail> {
    const { data } = await apiClient.get<MusicTrackDetail>(`/admin/music-tracks/${id}`);
    return data;
  },

  async create(body: {
    title: string;
    artist: string;
    audioKey: string;
    licenseType: string;
    licenseUrl: string;
    sourceUrl: string;
    attribution?: string;
    tags?: string[];
  }): Promise<MusicTrack> {
    const { data } = await apiClient.post<MusicTrack>('/admin/music-tracks', body);
    return data;
  },

  async update(id: string, patch: Partial<Pick<MusicTrack, 'title' | 'artist' | 'attribution' | 'tags'>>): Promise<MusicTrack> {
    const { data } = await apiClient.patch<MusicTrack>(`/admin/music-tracks/${id}`, patch);
    return data;
  },

  async deactivate(id: string): Promise<void> {
    await apiClient.delete(`/admin/music-tracks/${id}`);
  },

  async restore(id: string): Promise<void> {
    await apiClient.post(`/admin/music-tracks/${id}/restore`);
  },

  async exportAll(): Promise<MusicExportResult> {
    const { data } = await apiClient.get<MusicExportResult>('/admin/music-tracks/export');
    return data;
  },

  /**
   * Upload catalog audio: presign against the music endpoint, PUT the bytes,
   * return the key. Deliberately NOT `mediaAdminApi.uploadImage` — that path
   * writes a `Media` row with `messageId: null`, which the orphan-cleanup jobs
   * treat as garbage.
   */
  async uploadAudio(file: File, onProgress?: (percent: number) => void): Promise<string> {
    return mediaAdminApi.uploadCatalogAudio(file, onProgress);
  },
};

const AUDIO_MIMES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac'] as const;
export const AUDIO_ACCEPT = AUDIO_MIMES.join(',');
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

/** CSV cell escaping matching `ConversationsPage` so Excel reads it the same. */
function toCsvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildMusicCsv(rows: MusicTrack[]): string {
  const header = [
    'ID', 'Tiêu đề', 'Nghệ sĩ', 'Thời lượng (ms)', 'Giấy phép',
    'URL giấy phép', 'URL nguồn', 'Ghi công', 'Người thêm', 'Ngày thêm', 'Đang dùng',
  ];
  const lines = rows.map((t) =>
    [
      t._id, t.title, t.artist, t.durationMs, licenseLabel(t.licenseType),
      t.licenseUrl, t.sourceUrl, t.attribution, t.addedBy,
      t.addedAt ? new Date(t.addedAt).toISOString().slice(0, 10) : '',
      t.isActive ? 'Có' : 'Không',
    ].map(toCsvCell).join(','),
  );
  // BOM so Excel displays Vietnamese correctly.
  return `\uFEFF${[header.join(','), ...lines].join('\n')}`;
}
