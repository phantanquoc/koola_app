/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { TurnService } from './turn.service';

function makeTurnService(secret: string, nodeEnv?: string): TurnService {
  const originalEnv = process.env.NODE_ENV;
  if (nodeEnv !== undefined) {
    process.env.NODE_ENV = nodeEnv;
  }
  try {
    const configService = {
      get: (key: string, defaultValue?: unknown) => {
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
});
