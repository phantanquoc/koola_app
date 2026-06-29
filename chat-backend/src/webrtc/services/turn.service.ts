import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface RTCIceServer {
  urls: string;
  username?: string;
  credential?: string;
}

/**
 * Public STUN fallback. Always prepended to the ICE server list so a call can
 * still gather server-reflexive candidates (and connect on same-LAN / simple
 * NAT) even when coturn is unreachable — e.g. coturn not running on Windows
 * Docker Desktop, or COTURN_IP pointing at a host one peer can't route to.
 * Override via STUN_URLS (comma-separated) if you run your own STUN.
 */
const DEFAULT_PUBLIC_STUN = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
];

@Injectable()
export class TurnService {
  private readonly coturnHost: string;
  private readonly coturnSecret: string;
  private readonly coturnPort: number;
  private readonly publicStunUrls: string[];
  private readonly ttl = 3600; // seconds

  constructor(private readonly configService: ConfigService) {
    this.coturnHost = this.configService.get<string>('COTURN_IP', 'localhost');
    this.coturnSecret = this.configService.get<string>(
      'TURN_STATIC_SECRET',
      '',
    );
    this.coturnPort = this.configService.get<number>('COTURN_PORT', 3478);

    // Public STUN fallback list. Comma-separated STUN_URLS overrides the
    // Google default; an explicit empty string disables the fallback entirely.
    const stunEnv = this.configService.get<string>('STUN_URLS');
    if (stunEnv === undefined) {
      this.publicStunUrls = DEFAULT_PUBLIC_STUN;
    } else {
      this.publicStunUrls = stunEnv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // D7: Fail-fast if TURN_STATIC_SECRET is not set outside of test environments.
    // An empty secret produces a deterministic HMAC that attackers can forge.
    if (!this.coturnSecret && process.env.NODE_ENV !== 'test') {
      throw new Error('TURN_STATIC_SECRET must be set for production safety');
    }
  }

  generateCredentials(targetUserId: string): {
    username: string;
    password: string;
  } {
    const timestamp = Math.floor(Date.now() / 1000) + this.ttl;
    const username = `${timestamp}:${targetUserId}`;
    const password = crypto
      .createHmac('sha1', this.coturnSecret)
      .update(username)
      .digest('base64');
    return { username, password };
  }

  getIceServers(targetUserId: string): RTCIceServer[] {
    const { username, password } = this.generateCredentials(targetUserId);

    // Public STUN first (fallback path, no credentials), then coturn STUN/TURN.
    // Order is advisory only — the client's ICE agent probes all of them — but
    // listing reachable STUN first means a candidate is gathered fast even when
    // coturn is down.
    return [
      ...this.publicStunUrls.map((urls) => ({ urls })),
      { urls: `stun:${this.coturnHost}:${this.coturnPort}` },
      {
        urls: `turn:${this.coturnHost}:${this.coturnPort}`,
        username,
        credential: password,
      },
    ];
  }
}
