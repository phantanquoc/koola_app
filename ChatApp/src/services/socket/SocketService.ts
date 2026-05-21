import { io, Socket } from 'socket.io-client';
import ENV from '../../config/env';
import { getAccessTokenInMemory } from '../api/apiService';

type EventCallback = (...args: unknown[]) => void;

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  connect(token: string): void {
    if (this.socket?.connected) return;

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
      this.reconnectAttempt = 0;
      this.startHeartbeat();
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
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
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
    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      console.warn('[SocketService] Max reconnect attempts reached');
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

    this.reconnectTimer = setTimeout(() => {
      // Read fresh access token at reconnect time — token may have rotated
      // since the original connect() call.
      const token = getAccessTokenInMemory();
      if (!token) {
        console.warn('[SocketService] No access token available for reconnect');
        return;
      }
      this.connect(token);
    }, delay);
  }
}

export const socketService = new SocketService();
export default socketService;
