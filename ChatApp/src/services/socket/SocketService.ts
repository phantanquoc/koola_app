import { io, Socket } from 'socket.io-client';
import ENV from '../../config/env';
import {
  getAccessTokenInMemory,
  refreshAccessTokenForSocket,
} from '../api/apiService';

type EventCallback = (...args: unknown[]) => void;

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  /** Reason for the last disconnect — drives reconnect strategy. */
  private lastDisconnectReason: string | null = null;
  /**
   * Consecutive rapid-disconnect counter. Prevents infinite loop when
   * on('connect') fires but the server immediately kicks the client
   * (e.g. token still invalid). We only reset this after a connection
   * has been STABLE for a few seconds, not on every 'connect' event.
   */
  private consecutiveRapidDisconnects = 0;
  private connectionStableTimer: ReturnType<typeof setTimeout> | null = null;
  /** Guards against reconnect after intentional disconnect (logout race). */
  private intentionallyDisconnected = false;

  connect(token: string): void {
    if (this.socket?.connected) return;
    this.intentionallyDisconnected = false;

    // Clean up previous socket instance if it exists (reconnect scenario)
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(`${ENV.WS_URL}/chat`, {
      query: { token },
      // Start with polling — more reliable in RN Bridgeless mode — then
      // upgrade to websocket automatically once the session is established.
      transports: ['polling', 'websocket'],
      autoConnect: true,
      reconnection: false, // We handle reconnection manually
    });

    this.socket.on('connect', () => {
      console.log('[SocketService] Connected');
      this.startHeartbeat();

      // Do NOT reset reconnectAttempt immediately — wait until the connection
      // proves stable (survives 5s without disconnect). This prevents the
      // infinite-loop bug where the server accepts then immediately kicks us,
      // resetting the counter each cycle.
      if (this.connectionStableTimer) clearTimeout(this.connectionStableTimer);
      this.connectionStableTimer = setTimeout(() => {
        this.reconnectAttempt = 0;
        this.consecutiveRapidDisconnects = 0;
      }, 5000);

      // Attach all registered listeners to the new socket instance
      this.listeners.forEach((callbacks, event) => {
        callbacks.forEach((cb) => {
          this.socket?.on(event, cb);
        });
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[SocketService] Disconnected:', reason);
      this.stopHeartbeat();

      // If we disconnect before the stability timer fires, count it as rapid
      if (this.connectionStableTimer) {
        clearTimeout(this.connectionStableTimer);
        this.connectionStableTimer = null;
        this.consecutiveRapidDisconnects++;
      }

      this.lastDisconnectReason = reason;
      if (reason !== 'io client disconnect') {
        this.scheduleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('[SocketService] Connection error:', error.message);
      this.scheduleReconnect();
    });
  }

  disconnect(): void {
    this.intentionallyDisconnected = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectionStableTimer) {
      clearTimeout(this.connectionStableTimer);
      this.connectionStableTimer = null;
    }
    this.reconnectAttempt = 0;
    this.consecutiveRapidDisconnects = 0;
    this.lastDisconnectReason = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ─── Event management ──────────────────────────────────────────────────────

  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    this.socket?.on(event, callback);
  }

  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
    this.socket?.off(event, callback);
  }

  emit(event: string, data?: unknown): void {
    this.socket?.emit(event, data);
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.socket?.emit('ping');
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ─── Reconnect ─────────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    // Hard cap: if we've burned through max attempts OR experienced too many
    // rapid connect-then-disconnect cycles, give up entirely.
    if (
      this.reconnectAttempt >= this.maxReconnectAttempts ||
      this.consecutiveRapidDisconnects >= this.maxReconnectAttempts
    ) {
      console.warn(
        '[SocketService] Giving up reconnect after max attempts ' +
        `(attempts=${this.reconnectAttempt}, rapid=${this.consecutiveRapidDisconnects})`,
      );
      return;
    }

    const delay = Math.min(
      Math.pow(2, this.reconnectAttempt) * 1000,
      30000,
    );
    this.reconnectAttempt++;

    console.log(
      `[SocketService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`,
    );

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      this.attemptReconnect();
    }, delay);
  }

  private async attemptReconnect(): Promise<void> {
    // Bail out if disconnect() was called (e.g. logout) — no resurrection.
    if (this.intentionallyDisconnected) return;

    // 'io server disconnect' = server explicitly kicked us. This is the
    // strong signal that the token was rejected (expired / invalid). We must
    // refresh before reconnecting — using the stale token would just loop.
    if (this.lastDisconnectReason === 'io server disconnect') {
      const result = await refreshAccessTokenForSocket();

      // Re-check after async gap — disconnect() may have been called while
      // the refresh was in-flight (e.g. user logged out during token refresh).
      if (this.intentionallyDisconnected) return;

      switch (result.reason) {
        case 'ok':
          // Fresh token acquired — reconnect with it
          this.connect(result.token!);
          return;
        case 'auth':
          // Session permanently dead (forceLogout already fired inside
          // refreshAccessTokenForSocket). Stop reconnecting.
          console.warn(
            '[SocketService] Auth expired, stopping reconnect (logout triggered)',
          );
          return;
        case 'network':
          // Can't reach the server to refresh — schedule another attempt
          // with backoff. Do NOT logout.
          console.log(
            '[SocketService] Network error during token refresh, will retry',
          );
          this.scheduleReconnect();
          return;
      }
    }

    // For other disconnect reasons (transport close, ping timeout, etc.):
    // network-style reconnect using the current in-memory token.
    const token = getAccessTokenInMemory();
    if (!token) {
      console.warn('[SocketService] No access token available for reconnect');
      return;
    }
    this.connect(token);
  }
}

export const socketService = new SocketService();
export default socketService;
