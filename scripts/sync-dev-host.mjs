#!/usr/bin/env node
/**
 * sync-dev-host.mjs
 *
 * Detects the LAN IP of the dev machine and writes it to:
 *   - ChatApp/dev-config.json   (mobile runtime reads via @dev-config)
 *   - chat-backend/.env         (MINIO_PUBLIC_HOST for presigned URLs)
 *
 * Usage:
 *   npm run dev:sync-host                    # auto-detect
 *   npm run dev:sync-host -- --interface=Wi-Fi  # force specific interface
 *
 * Atomic writes via temp+rename to avoid race conditions with watchers.
 */
import { writeFileSync, readFileSync, renameSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { internalIpV4 } from 'internal-ip';
import { networkInterfaces } from 'node:os';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE_CONFIG = resolve(REPO, 'ChatApp/dev-config.json');
const BACKEND_ENV = resolve(REPO, 'chat-backend/.env');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function atomicWrite(targetPath, content) {
  const tmp = `${targetPath}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, targetPath);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (const arg of args) {
    const match = arg.match(/^--(\w[\w-]*)=(.+)$/);
    if (match) opts[match[1]] = match[2];
  }
  return opts;
}

/**
 * Patch key=value pairs in a .env file content string.
 * Preserves existing keys not in `patches`, updates or appends patched keys.
 */
function patchEnv(envContent, patches) {
  const lines = envContent.split('\n');
  const patched = new Set();

  const result = lines.map((line) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match && patches[match[1]] !== undefined) {
      patched.add(match[1]);
      return `${match[1]}=${patches[match[1]]}`;
    }
    return line;
  });

  // Append keys not already present
  for (const [key, value] of Object.entries(patches)) {
    if (!patched.has(key)) {
      result.push(`${key}=${value}`);
    }
  }

  return result.join('\n');
}

// ─── IP Detection ────────────────────────────────────────────────────────────

/**
 * Filter interfaces to find the best LAN IP.
 * Priority: Wi-Fi > Ethernet > other.
 * Excludes: loopback, link-local, Docker/WSL virtual, VPN (tun/utun/wg).
 */
function detectLanIp(preferInterface) {
  const ifaces = networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;

    // Skip virtual/VPN interfaces
    const lower = name.toLowerCase();
    if (
      lower.includes('docker') ||
      lower.includes('vethernet') ||
      lower.includes('veth') ||
      lower.startsWith('br-') ||
      lower.startsWith('tun') ||
      lower.startsWith('utun') ||
      lower.startsWith('wg') ||
      lower.includes('wsl')
    ) continue;

    for (const addr of addrs) {
      if (addr.family !== 'IPv4') continue;
      if (addr.internal) continue;
      if (addr.address.startsWith('169.254.')) continue; // link-local
      if (addr.address.startsWith('172.17.')) continue;  // Docker default

      let priority = 0;
      if (lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('wlan')) {
        priority = 10;
      } else if (lower.includes('ethernet') || lower.includes('eth')) {
        priority = 5;
      } else {
        priority = 1;
      }

      candidates.push({ name, address: addr.address, priority });
    }
  }

  if (candidates.length === 0) return null;

  // If user specified --interface, filter
  if (preferInterface) {
    const filtered = candidates.filter(
      (c) => c.name.toLowerCase().includes(preferInterface.toLowerCase()),
    );
    if (filtered.length > 0) return filtered[0].address;
    console.warn(`⚠ No interface matching "${preferInterface}" found. Available:`);
    for (const c of candidates) console.warn(`   ${c.name} → ${c.address}`);
    process.exit(1);
  }

  // Sort by priority descending
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0].address;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  // Try our heuristic first, fallback to internal-ip (UDP trick)
  let ip = detectLanIp(opts.interface);
  if (!ip) {
    ip = await internalIpV4();
  }

  if (!ip) {
    console.error('❌ Could not detect LAN IP. Check network connection.');
    console.error('   Or specify manually: npm run dev:sync-host -- --interface=Wi-Fi');
    process.exit(1);
  }

  console.log(`🔍 Detected LAN IP: ${ip}`);

  // ─── Write ChatApp/dev-config.json ───────────────────────────────────────
  // Merge into existing config so we never clobber flags like LOCAL_FIRST_SQLITE.
  let mobileConfig = {};
  if (existsSync(MOBILE_CONFIG)) {
    try {
      mobileConfig = JSON.parse(readFileSync(MOBILE_CONFIG, 'utf8'));
    } catch {
      console.warn('⚠ dev-config.json was malformed — recreating from scratch.');
    }
  }
  mobileConfig.DEV_HOST = ip;
  mobileConfig.DEV_PORT = 3000;
  atomicWrite(MOBILE_CONFIG, JSON.stringify(mobileConfig, null, 2) + '\n');
  console.log(`✓ ChatApp/dev-config.json → DEV_HOST=${ip}`);

  // ─── Patch chat-backend/.env ─────────────────────────────────────────────
  let envContent = '';
  if (existsSync(BACKEND_ENV)) {
    envContent = readFileSync(BACKEND_ENV, 'utf8');
  }
  const patched = patchEnv(envContent, { MINIO_PUBLIC_HOST: ip });
  atomicWrite(BACKEND_ENV, patched);
  console.log(`✓ chat-backend/.env → MINIO_PUBLIC_HOST=${ip}`);

  console.log(`\n🎉 Done. Both mobile and backend now point to ${ip}.`);
  console.log('   Backend dev-env-watcher will pick up the change automatically.');
  console.log('   Mobile: restart Metro if already running (Ctrl+C → npm start).');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
