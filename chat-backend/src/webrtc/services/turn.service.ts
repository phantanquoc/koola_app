import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface RTCIceServer {
  urls: string;
  username?: string;
  credential?: string;
}

@Injectable()
export class TurnService {
  private readonly coturnHost: string;
  private readonly coturnSecret: string;
  private readonly coturnPort: number;
  private readonly ttl = 3600; // seconds

  constructor(private readonly configService: ConfigService) {
    this.coturnHost = this.configService.get<string>('COTURN_IP', 'localhost');
    this.coturnSecret = this.configService.get<string>(
      'TURN_STATIC_SECRET',
      '',
    );
    this.coturnPort = this.configService.get<number>('COTURN_PORT', 3478);
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

    return [
      { urls: `stun:${this.coturnHost}:${this.coturnPort}` },
      {
        urls: `turn:${this.coturnHost}:${this.coturnPort}`,
        username,
        credential: password,
      },
    ];
  }
}
