import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promisify } from 'util';
import * as net from 'net';

const TCP_CONNECT = promisify(net.connect);

@Injectable()
export class CoturnHealthService {
  private readonly logger = new Logger(CoturnHealthService.name);
  private readonly coturnHost: string;
  private readonly coturnPort: number;

  constructor(private readonly configService: ConfigService) {
    this.coturnHost = this.configService.get<string>('COTURN_IP', 'localhost');
    this.coturnPort = this.configService.get<number>('COTURN_PORT', 3478);
  }

  async isReachable(): Promise<boolean> {
    try {
      const socket = net.createConnection({
        host: this.coturnHost,
        port: this.coturnPort,
      });

      const result = await Promise.race([
        new Promise<true>((resolve) => {
          socket.once('connect', () => {
            socket.destroy();
            resolve(true);
          });
        }),
        new Promise<false>((resolve) =>
          setTimeout(() => {
            socket.destroy();
            resolve(false);
          }, 3000),
        ),
      ]);

      return result;
    } catch (err) {
      this.logger.warn(
        `[CoturnHealth] Coturn unreachable at ${this.coturnHost}:${this.coturnPort}: ${err}`,
      );
      return false;
    }
  }
}
