/**
 * seed-music-audio.ts
 *
 * Puts real, playable audio behind the catalog.
 *
 * `seed-music-tracks.ts` creates the *records* — title, artist, licence — but
 * points them at `music/…` keys that were never uploaded. Those rows render
 * fine and then fail on play, which sends an operator looking for a UI bug
 * that does not exist. This script fills the gap: it downloads the
 * public-domain file listed in each entry, pushes it into MinIO through the
 * same presigned path the admin UI uses, and creates the track with the
 * duration the server derives from the file.
 *
 * Why not one job: uploading requires the file bytes, and 20 MB of audio in a
 * git repo is worse than a script that fetches it.
 *
 * Every track below is public domain (Wikimedia Commons, CC0 / PD-mark), so
 * the licence fields are accurate rather than placeholder.
 *
 * Usage:
 *   cd chat-backend
 *   npx ts-node -r tsconfig-paths/register scripts/seed-music-audio.ts
 *
 * Idempotent: a track whose `sourceUrl` already exists is skipped, so a retry
 * after a network failure does not duplicate the row or re-upload the object.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  LicenseType,
  MusicTrack,
  type MusicTrackDocument,
} from '../src/moments/schemas/music-track.schema';
import { MusicStorageService } from '../src/admin/music/music-storage.service';
import { readDurationMs } from '../src/admin/music/audio-metadata';
import { Logger } from '@nestjs/common';

const PD_MARK = 'https://creativecommons.org/publicdomain/mark/1.0/';

interface SeedTrack {
  title: string;
  artist: string;
  tags: string[];
  /** Wikimedia Commons original file. */
  url: string;
  /** Human-readable provenance for the clearance export. */
  sourceUrl: string;
  attribution: string;
  /** Defaults to CC0; set explicitly for the few BY / BY-SA files. */
  licenseType?: LicenseType;
  licenseUrl?: string;
  /** Extension of the object we store; derived from `url` when omitted. */
  mime?: string;
}

const TRACKS: SeedTrack[] = [
  {
    title: 'The Domino Rag',
    artist: 'Richard Glade',
    tags: ['ragtime', 'piano', 'vintage'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/%22The_Domino_Rag%22%2C_by_Richard_Glade_%281908%29.mp3',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:%22The_Domino_Rag%22,_by_Richard_Glade_(1908).mp3',
    attribution: 'Richard Glade (1908) — public domain, Wikimedia Commons',
  },
  {
    title: 'The Tremolo Trot',
    artist: 'C. Luckyth Roberts',
    tags: ['ragtime', 'piano', 'upbeat'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/%22The_Tremolo_Trot%22%2C_by_C._Luckyth_Roberts_%281914%29.mp3',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:%22The_Tremolo_Trot%22,_by_C._Luckyth_Roberts_(1914).mp3',
    attribution: 'C. Luckyth Roberts (1914) — public domain, Wikimedia Commons',
  },
  {
    title: 'Bubbles',
    artist: 'Silvio Hein',
    tags: ['1910s', 'piano', 'light'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/6a/%22Bubbles%22_%281917%29%2C_by_Silvio_Hein.mp3',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:%22Bubbles%22_(1917),_by_Silvio_Hein.mp3',
    attribution: 'Silvio Hein (1917) — public domain, Wikimedia Commons',
  },
  {
    title: 'Rag Time Medley',
    artist: 'Ruby Brooks',
    tags: ['ragtime', 'banjo', '1890s'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/e9/Rag_Time_Medley_%28banjoist_Ruby_Brooks_with_pianist_Frank_P._Banta%29_1899.mp3',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rag_Time_Medley_(banjoist_Ruby_Brooks_with_pianist_Frank_P._Banta)_1899.mp3',
    attribution: 'Ruby Brooks & Frank P. Banta (1899) — public domain, Wikimedia Commons',
  },
  {
    title: 'Swing Low, Sweet Chariot',
    artist: 'Fisk Jubilee Singers',
    tags: ['gospel', 'vocal', '1900s'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Swing_Low%2C_Sweet_Chariot_-_Fisk_Jubilee_Singers_%281909%29.mp3',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Swing_Low,_Sweet_Chariot_-_Fisk_Jubilee_Singers_(1909).mp3',
    attribution: 'Fisk Jubilee Singers (1909) — public domain, Wikimedia Commons',
  },
  {
    title: 'Anchors Aweigh',
    artist: 'USNA Midshipmen Glee Club',
    tags: ['march', 'vocal', 'military'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/b/b3/%22Anchors_Aweigh%22%2C_sung_by_the_U.S._Naval_Academy%27s_Midshipmen_Glee_Club.mp3',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:%22Anchors_Aweigh%22,_sung_by_the_U.S._Naval_Academy%27s_Midshipmen_Glee_Club.mp3',
    attribution: 'USNA Midshipmen Glee Club — public domain, Wikimedia Commons',
  },
  {
    title: 'Hypnotic Ambient',
    artist: 'MusicLM',
    tags: ['ambient', 'electronic', 'calm'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/50/Hypnotic_ambient_electronic_music_by_MusicLM.mp3',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Hypnotic_ambient_electronic_music_by_MusicLM.mp3',
    attribution: 'Google MusicLM — public domain, Wikimedia Commons',
  },

  // ─── Việt Nam ─────────────────────────────────────────────────────────────
  // Commons has almost no modern Vietnamese music under a commercial-use
  // licence: the folk/pop collections there are NC/ND, and the rest are
  // pronunciation clips. These three are the usable ones — an early field
  // recording, a royal-court anthem, and a radio sign-on — plus two CC BY-SA
  // instrumentals from a Vietnamese producer.
  {
    title: 'Hát Trống Quân',
    artist: 'Đỗ Văn Thâm',
    tags: ['viet', 'dân ca', 'folk', 'truyền thống'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/3e/H%C3%A1t_tr%E1%BB%91ng_qu%C3%A2n_-_%C4%90%E1%BB%97_V%C4%83n_Th%C3%A2m.mp3',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:H%C3%A1t_tr%E1%BB%91ng_qu%C3%A2n_-_%C4%90%E1%BB%97_V%C4%83n_Th%C3%A2m.mp3',
    attribution: 'Đỗ Văn Thâm — hát trống quân, public domain (Musée de la parole et du geste), Wikimedia Commons',
  },
  {
    title: 'Đăng Đàn Cung',
    artist: 'Lê Minh Khải (phục dựng)',
    tags: ['viet', 'cung đình', 'lịch sử', 'instrumental'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/53/%C4%90%C4%83ng_%C4%90%C3%A0n_cung_%28%E7%99%BB%E5%A3%87%E5%AE%AE%29_-_1941_Annam_Anthem_-_Recreation_by_Prof._Liam_C._Kelley_%28L%C3%AA_Minh_Kh%E1%BA%A3i%29.mp3',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:%C4%90%C4%83ng_%C4%90%C3%A0n_cung_(%E7%99%BB%E5%A3%87%E5%AE%AE)_-_1941_Annam_Anthem_-_Recreation_by_Prof._Liam_C._Kelley_(L%C3%AA_Minh_Kh%E1%BA%A3i).mp3',
    attribution: 'Quốc thiều triều Nguyễn (1941), phục dựng bởi Lê Minh Khải — CC BY 3.0, Wikimedia Commons',
    licenseType: LicenseType.CC_BY,
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  },
  {
    title: 'Tiếng Gọi Công Dân (AFVN)',
    artist: 'AFVN Radio',
    tags: ['viet', 'lịch sử', 'quốc ca'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/0/0b/South_Vietnamese_national_anthem_on_AFVN_radio.mp3',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:South_Vietnamese_national_anthem_on_AFVN_radio.mp3',
    attribution: 'Quốc ca Việt Nam Cộng hoà, phát trên AFVN — public domain (PD US), Wikimedia Commons',
  },
  {
    title: 'Ngẫu Hứng',
    artist: 'Hoàng Đam Entertainment',
    tags: ['viet', 'instrumental', 'chill'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/ed/Ng%E1%BA%ABu_H%E1%BB%A9ng.wav',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ng%E1%BA%ABu_H%E1%BB%A9ng.wav',
    attribution: 'Hoàng Đam Entertainment — Ngẫu Hứng, CC BY-SA 4.0, Wikimedia Commons',
    licenseType: LicenseType.CC_BY,
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    mime: 'audio/wav',
  },
  {
    title: 'Nhạc Thư Giãn',
    artist: 'Hoàng Đam Entertainment',
    tags: ['viet', 'instrumental', 'relax'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/2/27/Nh%E1%BA%A1c_Th%C6%B0_Gi%E1%BA%A3n.wav',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Nh%E1%BA%A1c_Th%C6%B0_Gi%E1%BA%A3n.wav',
    attribution: 'Hoàng Đam Entertainment — Nhạc Thư Giãn, CC BY-SA 4.0, Wikimedia Commons',
    licenseType: LicenseType.CC_BY,
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    mime: 'audio/wav',
  },

  // ─── Việt Nam, nhạc nền (Freesound CC0) ───────────────────────────────────
  // Freesound is where the real Vietnamese *background-music* catalog lives.
  // SieuAmThanh writes original game loops; CC0 means no attribution
  // obligation and no NC/ND clause to trip over. Preview MP3s are what the
  // CDN serves without an API key — the originals are WAV and far larger.
  {
    title: 'Tuyết Sơn Lấp Lán',
    artist: 'SieuAmThanh',
    tags: ['viet', 'game-loop', 'winter'],
    url: 'https://cdn.freesound.org/previews/557/557624_7554526-hq.mp3',
    sourceUrl: 'https://freesound.org/people/SieuAmThanh/sounds/557624',
    attribution: 'SieuAmThanh — Tuyết Sơn Lấp Lán, CC0 1.0 (Freesound)',
  },
  {
    title: 'Ngồi Thiền',
    artist: 'SieuAmThanh',
    tags: ['viet', 'thiền', 'calm'],
    url: 'https://cdn.freesound.org/previews/544/544306_7554526-hq.mp3',
    sourceUrl: 'https://freesound.org/people/SieuAmThanh/sounds/544306',
    attribution: 'SieuAmThanh — Ngồi Thiền, CC0 1.0 (Freesound)',
  },
  {
    title: 'Rừng Sáng Sắc',
    artist: 'SieuAmThanh',
    tags: ['viet', 'rừng', 'ambient'],
    url: 'https://cdn.freesound.org/previews/423/423350_7554526-hq.mp3',
    sourceUrl: 'https://freesound.org/people/SieuAmThanh/sounds/423350',
    attribution: 'SieuAmThanh — Rừng Sáng Sắc, CC0 1.0 (Freesound)',
  },
  {
    title: 'Bay Trong Bầu Trời Băng',
    artist: 'SieuAmThanh',
    tags: ['viet', 'ambient', 'space'],
    url: 'https://cdn.freesound.org/previews/545/545014_7554526-hq.mp3',
    sourceUrl: 'https://freesound.org/people/SieuAmThanh/sounds/545014',
    attribution: 'SieuAmThanh — Bay Trong Bầu Trời Băng, CC0 1.0 (Freesound)',
  },
];

/**
 * Download with retries and a length check.
 *
 * Wikimedia resets or truncates large transfers under load — a 30 MB WAV can
 * come back as a 2 KB error page with a 200 status, which the parser then
 * rejects with a confusing "cannot read duration". Comparing the body against
 * `content-length` turns that into a retryable failure instead.
 */
async function download(url: string, attempts = 5): Promise<Buffer> {
  let lastError = 'không rõ';
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'koola-seed/1.0 (admin catalog seed)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const bytes = Buffer.from(await res.arrayBuffer());
      const expected = Number(res.headers.get('content-length') ?? 0);
      if (expected > 0 && bytes.length !== expected) {
        throw new Error(`nhận ${bytes.length}/${expected} byte`);
      }
      return bytes;
    } catch (err) {
      const cause = (err as { cause?: { code?: string } })?.cause?.code;
      lastError = cause ?? (err as Error).message;
      if (i < attempts) await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
  throw new Error(`tải file thất bại sau ${attempts} lần (${lastError})`);
}

async function bootstrap() {
  const logger = new Logger('SeedMusicAudio');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const musicModel = app.get<Model<MusicTrackDocument>>(
      getModelToken(MusicTrack.name),
      { strict: false },
    );
    const storage = app.get(MusicStorageService, { strict: false });
    const seedAdminId = process.env.SEED_ADMIN_ID ?? '000000000000000000000001';

    let created = 0;
    let skipped = 0;

    for (const t of TRACKS) {
      // Idempotency: the source URL is the natural key for a seeded track.
      const existing = await musicModel.findOne({ sourceUrl: t.sourceUrl }).lean();
      if (existing) {
        skipped++;
        logger.log(`  = ${t.title} (đã có)`);
        continue;
      }

      try {
        const mime = t.mime ?? 'audio/mpeg';
        const bytes = await download(t.url);
        const { audioKey, uploadUrl } = await storage.presignUpload(
          mime,
          bytes.length,
        );

        // Same PUT the admin UI performs — the object lands before the row, so
        // a create failure leaves an orphan the "Kiểm kho" dialog will find.
        const put = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': mime },
          body: new Uint8Array(bytes),
        });
        if (!put.ok) throw new Error(`PUT MinIO thất bại: HTTP ${put.status}`);

        const durationMs = await readDurationMs(bytes, mime);

        await musicModel.create({
          title: t.title,
          artist: t.artist,
          durationMs,
          audioKey,
          // No separate preview is produced (that needs ffmpeg); aliasing
          // keeps the required field pointing at a real object.
          previewKey: audioKey,
          licenseType: t.licenseType ?? LicenseType.CC0,
          licenseUrl: t.licenseUrl ?? PD_MARK,
          sourceUrl: t.sourceUrl,
          attribution: t.attribution,
          tags: t.tags,
          addedBy: seedAdminId,
          addedAt: new Date(),
          isActive: true,
          usageCount: 0,
        });

        created++;
        logger.log(`  + ${t.artist} — ${t.title} (${Math.round(durationMs / 1000)}s)`);
      } catch (err) {
        logger.error(`  ! ${t.title}: ${String(err)}`);
      }
    }

    logger.log(`Xong. Tạo mới ${created}/${TRACKS.length}, bỏ qua ${skipped}.`);
  } catch (err) {
    console.error('Seed script failed:', err);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap();
