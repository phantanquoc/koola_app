import { config as parseDotenv } from 'dotenv';
import { readFileSync, watch } from 'node:fs';
import { invalidateMinioPublicClient } from './media/minio-client';

export function startDevEnvWatcher(): void {
  if (process.env.NODE_ENV === 'production') return;
  let timer: NodeJS.Timeout | null = null;
  let lastHostApplied: string | undefined = process.env.MINIO_PUBLIC_HOST;

  watch('.env', { persistent: false }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const raw = readFileSync('.env', 'utf8');
        if (raw.trim().length === 0) {
          console.warn('[dev] .env appears empty, skipping reload');
          return;
        }
        const result = parseDotenv({
          path: '.env',
          processEnv: {} as Record<string, string>,
        });
        const parsed = result.parsed;
        if (!parsed || !parsed.MINIO_PUBLIC_HOST) {
          console.warn('[dev] .env reload missing MINIO_PUBLIC_HOST, skipping');
          return;
        }
        for (const [k, v] of Object.entries(parsed)) process.env[k] = v;
        if (parsed.MINIO_PUBLIC_HOST !== lastHostApplied) {
          invalidateMinioPublicClient();
          lastHostApplied = parsed.MINIO_PUBLIC_HOST;
          console.log(
            `[dev] .env reloaded — MINIO_PUBLIC_HOST=${parsed.MINIO_PUBLIC_HOST}`,
          );
        }
      } catch (err) {
        console.warn('[dev] .env reload failed:', (err as Error).message);
      }
    }, 200);
  });

  console.log('[dev] Watching .env for hot-reload');
}
