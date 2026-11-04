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
  /** Resolved display name; only the export endpoint fills it (§3B2). */
  addedByName?: string | null;
}

/** Detail read adds freshly signed playback URLs; the list never carries them. */
export interface MusicTrackDetail extends MusicTrack {
  audioUrl: string;
  previewUrl: string;
  /**
   * Live stories still pointing at this track — what "Ngưng" would affect.
   * No post count: `Post` has no music field, so it could only ever be 0.
   */
  usage?: { stories: number; total: number };
  /** Resolved display name of the admin who added it (§3B2: no raw ObjectId). */
  addedByName?: string | null;
}

export interface MusicStats {
  all: number;
  active: number;
  inactive: number;
  /** Tracks never attached to a story — candidates for retiring. */
  unused: number;
  byLicense: Record<string, number>;
  /** Distinct tags currently in use — powers the tag filter options. */
  tags: string[];
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

export interface MusicOrphanObject {
  key: string;
  size: number;
  /** ISO string on the wire (JSON), Date when rendered. */
  lastModified: string;
  /** false while the grace window still protects it from deletion. */
  eligible: boolean;
}

export interface MusicOrphanReport {
  /** Total objects under `music-catalog/`. */
  objects: number;
  /** Keys referenced by at least one track row. */
  referenced: number;
  orphans: MusicOrphanObject[];
  /** Too new to delete — likely mid-create. */
  pending: number;
  /** Outside the grace window and unreferenced. */
  eligible: number;
  graceHours: number;
}

export interface MusicOrphanPurge {
  deleted: number;
  bytes: number;
  failed: number;
  failures: string[];
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
    tag?: string;
    /** Only tracks never attached to a story. */
    unused?: boolean;
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

  /** Catalog objects no track points at, with a grace window before deletion. */
  async orphans(): Promise<MusicOrphanReport> {
    const { data } = await apiClient.get<MusicOrphanReport>('/admin/music-tracks/orphans');
    return data;
  },

  /**
   * Delete the orphans the server considers eligible. The server re-lists and
   * re-diffs, never trusting a client-supplied key list — a track could have
   * been created against one of those keys since the report was rendered.
   */
  async purgeOrphans(): Promise<MusicOrphanPurge> {
    const { data } = await apiClient.delete<MusicOrphanPurge>('/admin/music-tracks/orphans');
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

/**
 * Only http(s) links are rendered as anchors. License/source URLs are
 * admin-entered text; `javascript:` in an href executes on click.
 */
export function externalHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function buildMusicCsv(rows: MusicTrack[]): string {
  const header = [
    'ID', 'Tiêu đề', 'Nghệ sĩ', 'Thời lượng (ms)', 'Giấy phép',
    'URL giấy phép', 'URL nguồn', 'Ghi công', 'Tags',
    'Người thêm', 'Ngày thêm', 'Lượt dùng (tích luỹ)', 'Đang dùng',
  ];
  const lines = rows.map((t) =>
    [
      t._id, t.title, t.artist, t.durationMs, licenseLabel(t.licenseType),
      t.licenseUrl, t.sourceUrl, t.attribution, (t.tags ?? []).join(' '),
      // Display name from the export endpoint; a raw ObjectId is a useless hex
      // cell in a clearance spreadsheet (§3B2), so it is never the fallback.
      t.addedByName ?? '',
      t.addedAt ? new Date(t.addedAt).toISOString().slice(0, 10) : '',
      t.usageCount ?? 0,
      t.isActive ? 'Có' : 'Không',
    ].map(toCsvCell).join(','),
  );
  // BOM so Excel displays Vietnamese correctly.
  return `\uFEFF${[header.join(','), ...lines].join('\n')}`;
}
