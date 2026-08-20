import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { TurnService } from './turn.service';

function makeTurnService(
  secret: string,
  nodeEnv?: string,
  extra?: Record<string, unknown>,
): TurnService {
  const originalEnv = process.env.NODE_ENV;
  if (nodeEnv !== undefined) {
    process.env.NODE_ENV = nodeEnv;
  }
  try {
    const configService = {
      get: (key: string, defaultValue?: unknown) => {
        if (extra && key in extra) return extra[key];
        if (key === 'TURN_STATIC_SECRET') return secret;
        if (key === 'COTURN_IP') return 'localhost';
        if (key === 'COTURN_PORT') return 3478;
        return defaultValue;
      },
    } as unknown as ConfigService;
    return new TurnService(configService);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
}

describe('TurnService', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  // ── D7: Fail-fast tests ────────────────────────────────────────────────────

  it('throws when secret is empty and NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    const configService = {
      get: (key: string, defaultValue?: unknown) => {
        if (key === 'TURN_STATIC_SECRET') return '';
        if (key === 'COTURN_IP') return 'localhost';
        if (key === 'COTURN_PORT') return 3478;
        return defaultValue;
      },
    } as unknown as ConfigService;
    expect(() => new TurnService(configService)).toThrow(
      'TURN_STATIC_SECRET must be set for production safety',
    );
  });

  it('throws when secret is undefined and NODE_ENV=development', () => {
    process.env.NODE_ENV = 'development';
    const configService = {
      get: (key: string, defaultValue?: unknown) => {
        if (key === 'TURN_STATIC_SECRET') return '';
        if (key === 'COTURN_IP') return 'localhost';
        if (key === 'COTURN_PORT') return 3478;
        return defaultValue;
      },
    } as unknown as ConfigService;
    expect(() => new TurnService(configService)).toThrow(
      'TURN_STATIC_SECRET must be set for production safety',
    );
  });

  it('does NOT throw when secret is empty and NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    const configService = {
      get: (key: string, defaultValue?: unknown) => {
        if (key === 'TURN_STATIC_SECRET') return '';
        if (key === 'COTURN_IP') return 'localhost';
        if (key === 'COTURN_PORT') return 3478;
        return defaultValue;
      },
    } as unknown as ConfigService;
    expect(() => new TurnService(configService)).not.toThrow();
  });

  it('does NOT throw when secret is set regardless of NODE_ENV', () => {
    for (const env of ['production', 'development', 'test']) {
      process.env.NODE_ENV = env;
      const configService = {
        get: (key: string, defaultValue?: unknown) => {
          if (key === 'TURN_STATIC_SECRET') return 'test-secret-not-for-prod';
          if (key === 'COTURN_IP') return 'localhost';
          if (key === 'COTURN_PORT') return 3478;
          return defaultValue;
        },
      } as unknown as ConfigService;
      expect(() => new TurnService(configService)).not.toThrow();
    }
  });

  // ── generateCredentials ────────────────────────────────────────────────────

  it('generateCredentials produces <epoch+3600>:<userId> username and base64 HMAC-SHA1 password', () => {
    process.env.NODE_ENV = 'test';
    const secret = 'test-secret-not-for-prod';
    const service = makeTurnService(secret, 'test');

    const userId = 'user-123';
    const before = Math.floor(Date.now() / 1000);
    const { username, password } = service.generateCredentials(userId);
    const after = Math.floor(Date.now() / 1000);

    // username format: <timestamp>:<userId>
    const [timestampStr, ...rest] = username.split(':');
    const timestamp = parseInt(timestampStr, 10);
    expect(rest.join(':')).toBe(userId);
    // timestamp should be ~now + 3600
    expect(timestamp).toBeGreaterThanOrEqual(before + 3600);
    expect(timestamp).toBeLessThanOrEqual(after + 3600);

    // password should be base64-encoded HMAC-SHA1
    const expectedPassword = crypto
      .createHmac('sha1', secret)
      .update(username)
      .digest('base64');
    expect(password).toBe(expectedPassword);
  });

  // ── getIceServers: public STUN fallback ─────────────────────────────────────

  it('prepends public STUN before coturn STUN/TURN by default', () => {
    const service = makeTurnService('test-secret-not-for-prod', 'test');
    const servers = service.getIceServers('user-123');

    // First entries are credential-less public STUN.
    expect(servers[0]).toEqual({ urls: 'stun:stun.l.google.com:19302' });
    expect(servers[1]).toEqual({ urls: 'stun:stun1.l.google.com:19302' });

    // coturn STUN + TURN still present, TURN carries credentials.
    const turn = servers.find((s) => s.urls.startsWith('turn:'));
    expect(turn).toBeDefined();
    expect(turn?.urls).toBe('turn:localhost:3478');
    expect(turn?.username).toBeTruthy();
    expect(turn?.credential).toBeTruthy();
    expect(servers.some((s) => s.urls === 'stun:localhost:3478')).toBe(true);
  });

  it('honors STUN_URLS override (comma-separated)', () => {
    const service = makeTurnService('test-secret-not-for-prod', 'test', {
      STUN_URLS: 'stun:a.example:3478, stun:b.example:3478',
    });
    const servers = service.getIceServers('u1');
    expect(servers[0]).toEqual({ urls: 'stun:a.example:3478' });
    expect(servers[1]).toEqual({ urls: 'stun:b.example:3478' });
  });

  it('disables the public STUN fallback when STUN_URLS is empty', () => {
    const service = makeTurnService('test-secret-not-for-prod', 'test', {
      STUN_URLS: '',
    });
    const servers = service.getIceServers('u1');
    // Only coturn STUN + TURN remain (no public Google STUN).
    expect(servers.some((s) => s.urls.includes('google'))).toBe(false);
    expect(servers).toHaveLength(2);
  });

  // ── COTURN_PUBLIC_HOST: peer-facing host split ─────────────────────────────

  it('COTURN_PUBLIC_HOST overrides COTURN_IP in every client-facing ICE URL', () => {
    const service = makeTurnService('test-secret-not-for-prod', 'test', {
      COTURN_PUBLIC_HOST: 'turn.example.com',
      COTURN_IP: '192.168.1.50',
    });
    const servers = service.getIceServers('user-123');

    // Peer-facing entries use the public host.
    expect(servers).toContainEqual({ urls: 'stun:turn.example.com:3478' });
    const turn = servers.find((s) => s.urls.startsWith('turn:'));
    expect(turn?.urls).toBe('turn:turn.example.com:3478');

    // Neither the internal COTURN_IP nor localhost leaks into any URL.
    for (const s of servers) {
      expect(s.urls).not.toContain('192.168.1.50');
      expect(s.urls).not.toContain('localhost');
    }

    // Public STUN fallback still prepended; TURN credentials still derive
    // from the shared TURN_STATIC_SECRET regardless of advertised host.
    expect(servers[0]).toEqual({ urls: 'stun:stun.l.google.com:19302' });
    expect(turn?.username).toBeTruthy();
    expect(turn?.credential).toBe(
      crypto
        .createHmac('sha1', 'test-secret-not-for-prod')
        .update(turn!.username!)
        .digest('base64'),
    );
  });

  it('blank COTURN_PUBLIC_HOST falls back to COTURN_IP', () => {
    for (const blank of ['', '   ']) {
      const service = makeTurnService('test-secret-not-for-prod', 'test', {
        COTURN_PUBLIC_HOST: blank,
        COTURN_IP: '192.168.1.50',
      });
      const servers = service.getIceServers('user-123');
      expect(servers).toContainEqual({ urls: 'stun:192.168.1.50:3478' });
      expect(servers).toContainEqual(
        expect.objectContaining({ urls: 'turn:192.168.1.50:3478' }),
      );
      expect(servers.some((s) => s.urls.includes('localhost'))).toBe(false);
    }
  });

  it('keeps legacy localhost default when both COTURN_PUBLIC_HOST and COTURN_IP are unset', () => {
    const service = makeTurnService('test-secret-not-for-prod', 'test', {
      COTURN_IP: undefined,
    });
    const servers = service.getIceServers('user-123');
    expect(servers).toContainEqual({ urls: 'stun:localhost:3478' });
    expect(servers).toContainEqual(
      expect.objectContaining({ urls: 'turn:localhost:3478' }),
    );
    // Public STUN fallback entries remain prepended.
    expect(servers[0]).toEqual({ urls: 'stun:stun.l.google.com:19302' });
    expect(servers[1]).toEqual({ urls: 'stun:stun1.l.google.com:19302' });
  });
});
