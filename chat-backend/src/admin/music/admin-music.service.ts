import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LicenseType,
  MusicTrack,
  MusicTrackDocument,
} from '../../moments/schemas/music-track.schema';
import { escapeRegExp } from '../../common/utils/escape-regexp';
import { AdminAuditService } from '../admin-audit.service';
import { MusicStorageService } from './music-storage.service';
import { readDurationMs } from './audio-metadata';
import {
  CreateMusicTrackDto,
  ListMusicTracksDto,
  MUSIC_SORT_FIELDS,
  UpdateMusicTrackDto,
} from './dto/music.dto';

/** Fields a PATCH is not allowed to touch, refused by name. */
const IMMUTABLE_FIELDS = [
  'audioKey',
  'previewKey',
  'durationMs',
  'sourceUrl',
  'licenseType',
  'licenseUrl',
  'addedBy',
  'addedAt',
] as const;

/** Export row cap — an announced truncation beats a silently short file. */
export const MUSIC_EXPORT_MAX = 5000;

const REQUIRED_FOR_CC_BY = 'CC-BY cần ghi công (attribution)';

export interface MusicTrackWithUrls extends Record<string, unknown> {
  audioUrl: string;
  previewUrl: string;
}

@Injectable()
export class AdminMusicService {
  constructor(
    @InjectModel(MusicTrack.name)
    private readonly musicTrackModel: Model<MusicTrackDocument>,
    private readonly storage: MusicStorageService,
    private readonly audit: AdminAuditService,
  ) {}

  // ─── Filters ───────────────────────────────────────────────────────────────

  /** Build the Mongo filter shared by list, stats and export. */
  private buildFilter(dto: {
    status?: string;
    q?: string;
    licenseType?: LicenseType;
  }): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    // Default to the active tab. The DTO also defaults it, but the service must
    // not depend on class-transformer having run (direct callers, tests).
    const status = dto.status ?? 'active';
    if (status === 'active') filter.isActive = true;
    else if (status === 'inactive') filter.isActive = false;

    if (dto.licenseType) filter.licenseType = dto.licenseType;

    // Case-insensitive substring, not $text: $text matches whole words only,
    // so `q=Scot` would miss "Scott Buckley". escapeRegExp keeps user input
    // literal instead of letting it rewrite the query.
    const q = dto.q?.trim();
    if (q) {
      const re = new RegExp(escapeRegExp(q), 'i');
      filter.$or = [{ title: re }, { artist: re }];
    }

    return filter;
  }

  /** Parse `field:dir`, rejecting anything outside the allow-list. */
  private parseSort(sort?: string): Record<string, 1 | -1> {
    if (!sort) return { addedAt: -1 };
    const [field, dir] = sort.split(':');
    if (!MUSIC_SORT_FIELDS.includes(field as never)) {
      throw new BadRequestException(
        `sort không hợp lệ. Chấp nhận: ${MUSIC_SORT_FIELDS.join('|')} × asc|desc`,
      );
    }
    if (dir !== 'asc' && dir !== 'desc') {
      throw new BadRequestException('sort phải có dạng field:asc|desc');
    }
    return { [field]: dir === 'asc' ? 1 : -1 };
  }

  // ─── Reads ─────────────────────────────────────────────────────────────────

  async list(dto: ListMusicTracksDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const filter = this.buildFilter(dto);
    const sort = this.parseSort(dto.sort);

    const [data, total] = await Promise.all([
      this.musicTrackModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.musicTrackModel.countDocuments(filter),
    ]);

    return { data, total, page, limit };
  }

  async stats() {
    const base = this.buildFilter({});
    const [all, active, inactive, licenseAgg] = await Promise.all([
      this.musicTrackModel.countDocuments(base),
      this.musicTrackModel.countDocuments({ ...base, isActive: true }),
      this.musicTrackModel.countDocuments({ ...base, isActive: false }),
      this.musicTrackModel.aggregate<{ _id: string; count: number }>([
        { $match: base },
        { $group: { _id: '$licenseType', count: { $sum: 1 } } },
      ]),
    ]);

    const byLicense: Record<string, number> = {
      [LicenseType.CC0]: 0,
      [LicenseType.CC_BY]: 0,
      [LicenseType.EPIDEMIC_SOUND]: 0,
      [LicenseType.OWNED_BY_KOOLA]: 0,
    };
    for (const row of licenseAgg) {
      if (row._id in byLicense) byLicense[row._id] = row.count;
    }

    return { all, active, inactive, byLicense };
  }

  /** Full document plus freshly signed playback URLs, for any lifecycle state. */
  async findOne(id: string): Promise<MusicTrackWithUrls> {
    this.assertObjectId(id);
    const track = await this.musicTrackModel.findById(id).lean();
    if (!track) throw new NotFoundException('Music track not found');

    const t = track as unknown as MusicTrack & { _id: unknown };
    const audioUrl = await this.storage.presignPlayback(t.audioKey);
    const previewUrl = t.previewKey
      ? await this.storage.presignPlayback(t.previewKey)
      : audioUrl;

    return {
      ...(track as unknown as Record<string, unknown>),
      audioUrl,
      previewUrl,
    };
  }

  /** Every track (active and inactive) for the license-clearance export. */
  async exportAll(limit = MUSIC_EXPORT_MAX) {
    const [data, total] = await Promise.all([
      this.musicTrackModel
        .find({})
        .sort({ addedAt: -1 })
        .limit(limit)
        .lean(),
      this.musicTrackModel.countDocuments({}),
    ]);
    return { data, total, truncated: total > data.length };
  }

  // ─── Writes ────────────────────────────────────────────────────────────────

  async create(dto: CreateMusicTrackDto, actorId: string, ip: string | null) {
    // The DTO whitelist already rejects this at the HTTP boundary; checking
    // here too means a future DTO loosening cannot silently accept a
    // client-declared duration that disagrees with the file.
    if ('durationMs' in (dto as unknown as Record<string, unknown>)) {
      throw new BadRequestException(
        'durationMs do được đọc từ file — không nhận từ client',
      );
    }

    if (dto.licenseType === LicenseType.CC_BY && !dto.attribution?.trim()) {
      throw new BadRequestException(REQUIRED_FOR_CC_BY);
    }

    const size = await this.storage.statSize(dto.audioKey);
    if (size === null) {
      throw new BadRequestException(
        'Audio chưa được tải lên — hãy upload file trước',
      );
    }

    const buffer = await this.storage.readObject(dto.audioKey);
    let durationMs: number;
    try {
      // MIME is not stored on the object, so infer from the key extension;
      // music-metadata also sniffs the container, so a wrong hint still parses.
      durationMs = await readDurationMs(buffer, mimeFromKey(dto.audioKey));
    } catch {
      throw new BadRequestException(
        'Không đọc được file âm thanh — kiểm tra lại định dạng',
      );
    }

    const doc = await this.musicTrackModel.create({
      title: dto.title,
      artist: dto.artist,
      durationMs,
      audioKey: dto.audioKey,
      // No 30s preview is produced (that needs ffmpeg and the product wants the
      // full track playable); aliasing keeps the required field non-null and
      // lets `previewKey ?? audioKey` fallbacks resolve to a real object.
      previewKey: dto.audioKey,
      licenseType: dto.licenseType,
      licenseUrl: dto.licenseUrl,
      sourceUrl: dto.sourceUrl,
      attribution: dto.attribution ?? '',
      tags: dto.tags ?? [],
      addedBy: actorId,
      addedAt: new Date(),
      isActive: true,
      usageCount: 0,
    });

    await this.audit.log({
      actorId,
      action: 'create_music_track',
      targetType: 'music_track',
      targetId: String(doc._id),
      payload: { ...dto, durationMs },
      ip,
    });

    return doc;
  }

  async update(
    id: string,
    body: UpdateMusicTrackDto & Record<string, unknown>,
    actorId: string,
    ip: string | null,
  ) {
    this.assertObjectId(id);

    const offending = IMMUTABLE_FIELDS.filter((f) => f in body);
    if (offending.length > 0) {
      throw new BadRequestException(
        `Không được sửa: ${offending.join(', ')}`,
      );
    }

    const updated = await this.musicTrackModel.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Music track not found');

    await this.audit.log({
      actorId,
      action: 'update_music_track',
      targetType: 'music_track',
      targetId: id,
      payload: body,
      ip,
    });
    return updated;
  }

  /** Soft-deactivate. A repeat on an already-inactive track writes no audit. */
  async deactivate(id: string, actorId: string, ip: string | null) {
    this.assertObjectId(id);
    const track = await this.musicTrackModel.findById(id).lean();
    if (!track) throw new NotFoundException('Music track not found');

    if (track.isActive === false) return { message: 'deleted' };

    await this.musicTrackModel.updateOne(
      { _id: id },
      { $set: { isActive: false } },
    );
    await this.audit.log({
      actorId,
      action: 'delete_music_track',
      targetType: 'music_track',
      targetId: id,
      ip,
    });
    return { message: 'deleted' };
  }

  /** Reactivate. A repeat on an already-active track writes no audit. */
  async restore(id: string, actorId: string, ip: string | null) {
    this.assertObjectId(id);
    const track = await this.musicTrackModel.findById(id).lean();
    if (!track) throw new NotFoundException('Music track not found');

    if (track.isActive === true) return { message: 'active' };

    await this.musicTrackModel.updateOne(
      { _id: id },
      { $set: { isActive: true } },
    );
    await this.audit.log({
      actorId,
      action: 'restore_music_track',
      targetType: 'music_track',
      targetId: id,
      ip,
    });
    return { message: 'active' };
  }

  private assertObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Music track not found');
    }
  }
}

function mimeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'm4a':
    case 'mp4':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    default:
      return 'audio/mpeg';
  }
}
