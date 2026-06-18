import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { JwtPayload } from '../../auth/jwt.strategy';

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    const token = client.handshake.query.token as string | undefined;

    if (!token) {
      throw new WsException({ code: 4001, message: 'Authentication failed' });
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: process.env.JWT_SECRET,
      });
      // Attach user to socket data for use in gateway handlers
      (client.data as { user?: { sub: string; email?: string } }).user = {
        sub: payload.sub,
        email: payload.email,
      };
      return true;
    } catch {
      throw new WsException({ code: 4001, message: 'Authentication failed' });
    }
  }
}
