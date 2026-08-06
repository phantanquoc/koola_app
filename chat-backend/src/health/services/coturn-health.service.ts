import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';

@Injectable()
export class CoturnHealthService {
  private readonly logger = new Logger(CoturnHealthService.name);
  private readonly coturnHost: string;
  private readonly coturnPort: number;

  constructor(private readonly configService: ConfigService) {
    // This probe runs FROM INSIDE the backend container, so it needs an
    // internally-routable host — not the peer-facing COTURN_IP that
    // TurnService hands to phones in the ICE server list. Same split as
    // MINIO_ENDPOINT (internal) vs MINIO_PUBLIC_HOST (client-facing).
    //
    // In infra-local this is the compose service name `chat-coturn`. Probing
    // COTURN_IP instead is actively misleading: when it is `localhost` the
    // socket hits the backend's own loopback and reports `coturn: up` even
    // when coturn is misconfigured or down.
    //
    // Falls back to COTURN_IP so environments that never declared the new var
    // keep their previous behaviour.
    //
    // Treat blank as unset: ConfigService only applies its default when the
    // value is `undefined`, but a declared-but-empty `COTURN_INTERNAL_HOST=`
    // (as shipped in .env.example) parses to ''. Passing '' to
    // net.createConnection silently means localhost — the exact loopback
    // false-positive this split exists to prevent.
    const internalHost = this.configService
      .get<string>('COTURN_INTERNAL_HOST', '')
      ?.trim();
    const publicHost = this.configService.get<string>('COTURN_IP', '')?.trim();
    this.coturnHost = internalHost || publicHost || 'localhost';
    this.coturnPort = this.configService.get<number>('COTURN_PORT', 3478);
  }

  async isReachable(): Promise<boolean> {
    // createConnection can also throw SYNCHRONOUSLY (e.g. ERR_SOCKET_BAD_PORT
    // from a non-numeric COTURN_PORT). That must stay a `false` — letting it
    // reject would turn a degraded probe into a 500 from /health.
    let socket: net.Socket;
    try {
      socket = net.createConnection({
        host: this.coturnHost,
        port: this.coturnPort,
      });
    } catch (err) {
      this.logUnreachable(err);
      return false;
    }

    return new Promise<boolean>((resolve) => {
      // Guarantee exactly one settle + one destroy across the connect / error /
      // timeout race, so a late event cannot leak a socket handle.
      let settled = false;
      const finish = (reachable: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(reachable);
      };

      const timer = setTimeout(() => finish(false), 3000);

      socket.once('connect', () => finish(true));

      // net.Socket reports failures by EMITTING 'error' asynchronously, so a
      // try/catch cannot see them — and an 'error' with no listener is rethrown
      // by EventEmitter as an UNCAUGHT EXCEPTION that kills the process
      // (main.ts installs no uncaughtException handler). A typo in
      // COTURN_INTERNAL_HOST (ENOTFOUND) or a removed coturn container
      // (ECONNREFUSED) would take the whole backend down, so this listener is
      // load-bearing, not defensive padding.
      socket.once('error', (err: Error) => {
        this.logUnreachable(err);
        finish(false);
      });
    });
  }

  private logUnreachable(err: unknown): void {
    const reason = err instanceof Error ? err.message : String(err);
    this.logger.warn(
      `[CoturnHealth] Coturn unreachable at ${this.coturnHost}:${this.coturnPort}: ${reason}`,
    );
  }
}
