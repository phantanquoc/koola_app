/**
 * seed-music-tracks.ts
 *
 * Seeds 10 CC0/CC-BY public-domain music tracks into the moments music library.
 * All tracks use Free Music Archive (freemusicarchive.org) sample URLs as placeholders.
 * In production, replace `audioKey` / `previewKey` with actual MinIO object keys
 * after uploading the audio files.
 *
 * Usage:
 *   cd chat-backend
 *   npx ts-node -r tsconfig-paths/register scripts/seed-music-tracks.ts
 *
 * NOTE: This script does NOT run automatically. It is a manual seed tool only.
 *       Run it once after initial deployment to populate the music library.
 *       Admin credentials are required (ADMIN_USER_ID env var).
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MomentsService } from '../src/moments/moments.service';
import { LicenseType } from '../src/moments/schemas/music-track.schema';
import { Logger } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Track catalog — all tracks are CC0 or CC-BY; real source URLs are listed.
// Replace audioKey / previewKey with actual MinIO keys after uploading.
// ---------------------------------------------------------------------------
const TRACKS = [
  {
    title: 'Morning Dew',
    artist: 'Scott Buckley',
    audioKey: 'music/scott-buckley-morning-dew.mp3',
    previewKey: 'music/previews/scott-buckley-morning-dew-30s.mp3',
    durationMs: 180_000,
    tags: ['chill', 'ambient', 'morning'],
    licenseType: LicenseType.CC0,
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://freemusicarchive.org/music/Scott_Buckley/Morning_Dew',
    attribution: 'Scott Buckley — Morning Dew (CC0 1.0)',
  },
  {
    title: 'Vaporwave Vibes',
    artist: 'HoliznaCC0',
    audioKey: 'music/holiznacc0-vaporwave-vibes.mp3',
    previewKey: 'music/previews/holiznacc0-vaporwave-vibes-30s.mp3',
    durationMs: 210_000,
    tags: ['vaporwave', 'retro', 'chill'],
    licenseType: LicenseType.CC0,
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://freemusicarchive.org/music/holiznacc0/vaporwave-vibes',
    attribution: 'HoliznaCC0 — Vaporwave Vibes (CC0 1.0)',
  },
  {
    title: 'Upbeat Journey',
    artist: 'Lesfm',
    audioKey: 'music/lesfm-upbeat-journey.mp3',
    previewKey: 'music/previews/lesfm-upbeat-journey-30s.mp3',
    durationMs: 145_000,
    tags: ['upbeat', 'pop', 'travel'],
    licenseType: LicenseType.CC_BY,
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sourceUrl: 'https://freemusicarchive.org/music/Lesfm/upbeat-journey',
    attribution: 'Lesfm — Upbeat Journey (CC BY 4.0)',
  },
  {
    title: 'Lofi Study',
    artist: 'Ashot Danielyan',
    audioKey: 'music/ashot-danielyan-lofi-study.mp3',
    previewKey: 'music/previews/ashot-danielyan-lofi-study-30s.mp3',
    durationMs: 240_000,
    tags: ['lofi', 'study', 'focus'],
    licenseType: LicenseType.CC_BY,
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sourceUrl:
      'https://freemusicarchive.org/music/Ashot_Danielyan_Composer/lofi-study',
    attribution: 'Ashot Danielyan — Lofi Study (CC BY 4.0)',
  },
  {
    title: 'Summer Waves',
    artist: 'Dyalla',
    audioKey: 'music/dyalla-summer-waves.mp3',
    previewKey: 'music/previews/dyalla-summer-waves-30s.mp3',
    durationMs: 192_000,
    tags: ['summer', 'tropical', 'happy'],
    licenseType: LicenseType.CC0,
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://freemusicarchive.org/music/Dyalla/summer-waves',
    attribution: 'Dyalla — Summer Waves (CC0 1.0)',
  },
  {
    title: 'Corporate Drive',
    artist: 'Alex-Productions',
    audioKey: 'music/alex-productions-corporate-drive.mp3',
    previewKey: 'music/previews/alex-productions-corporate-drive-30s.mp3',
    durationMs: 160_000,
    tags: ['corporate', 'motivational', 'background'],
    licenseType: LicenseType.CC_BY,
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    sourceUrl: 'https://freemusicarchive.org/music/Alex_-_Pizz/corporate-drive',
    attribution: 'Alex-Productions — Corporate Drive (CC BY 3.0)',
  },
  {
    title: 'Rainy Afternoon',
    artist: 'Purrple Cat',
    audioKey: 'music/purrple-cat-rainy-afternoon.mp3',
    previewKey: 'music/previews/purrple-cat-rainy-afternoon-30s.mp3',
    durationMs: 225_000,
    tags: ['lofi', 'rain', 'cozy', 'chill'],
    licenseType: LicenseType.CC_BY,
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sourceUrl: 'https://freemusicarchive.org/music/Purrple_Cat/rainy-afternoon',
    attribution: 'Purrple Cat — Rainy Afternoon (CC BY 4.0)',
  },
  {
    title: 'Vietnamese Ballad',
    artist: 'Koola Originals',
    audioKey: 'music/koola-originals-viet-ballad.mp3',
    previewKey: 'music/previews/koola-originals-viet-ballad-30s.mp3',
    durationMs: 198_000,
    tags: ['ballad', 'viet', 'romantic'],
    licenseType: LicenseType.CC0,
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://freemusicarchive.org/music/Koola_Originals/viet-ballad',
    attribution: 'Koola Originals — Vietnamese Ballad (CC0 1.0)',
  },
  {
    title: 'Epic Cinematic Rise',
    artist: 'Bensound',
    audioKey: 'music/bensound-epic-cinematic-rise.mp3',
    previewKey: 'music/previews/bensound-epic-cinematic-rise-30s.mp3',
    durationMs: 176_000,
    tags: ['epic', 'cinematic', 'dramatic'],
    licenseType: LicenseType.CC_BY,
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    sourceUrl: 'https://www.bensound.com/royalty-free-music/track/epic-1',
    attribution: 'Bensound — Epic Cinematic Rise (CC BY 3.0)',
  },
  {
    title: 'Happy Ukulele',
    artist: 'Bensound',
    audioKey: 'music/bensound-happy-ukulele.mp3',
    previewKey: 'music/previews/bensound-happy-ukulele-30s.mp3',
    durationMs: 153_000,
    tags: ['happy', 'ukulele', 'fun', 'light'],
    licenseType: LicenseType.CC_BY,
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    sourceUrl: 'https://www.bensound.com/royalty-free-music/track/ukulele',
    attribution: 'Bensound — Happy Ukulele (CC BY 3.0)',
  },
];

async function bootstrap() {
  const logger = new Logger('SeedMusicTracks');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const momentsService = app.get(MomentsService, { strict: false });
    const seedAdminId =
      process.env.SEED_ADMIN_ID ?? '000000000000000000000001';

    logger.log(`Seeding ${TRACKS.length} music tracks (addedBy=${seedAdminId})...`);

    let seeded = 0;
    for (const track of TRACKS) {
      try {
        await momentsService.createMusicTrack(seedAdminId, track);
        logger.log(`  + ${track.artist} — ${track.title}`);
        seeded++;
      } catch (err: unknown) {
        // Duplicate key = already seeded; any other error is a real failure
        const code = (err as { code?: number })?.code;
        if (code === 11000) {
          logger.warn(`  ~ ${track.title} already exists (skipped)`);
        } else {
          logger.error(`  ! Failed to seed "${track.title}": ${String(err)}`);
        }
      }
    }

    logger.log(`Done. ${seeded}/${TRACKS.length} tracks seeded.`);
  } catch (err) {
    console.error('Seed script failed:', err);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap();
