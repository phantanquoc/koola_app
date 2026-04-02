import { asyncStorage } from './storage/asyncStorage';
import { messagesApi } from './api/apiService';
import type { QueuedMessage } from '../types';

type Listener = () => void;

const MAX_RETRIES = 5;
const MAX_DELAY_MS = 30000;

class OfflineQueueService {
  private queue: QueuedMessage[] = [];
  private listeners: Set<Listener> = new Set();
  private isProcessing = false;

  // ─── Queue CRUD ────────────────────────────────────────────────────────────

  getQueue(): QueuedMessage[] {
    return [...this.queue];
  }

  async add(message: QueuedMessage): Promise<void> {
    this.queue.push(message);
    await this.persist();
    this.notify();
  }

  async remove(id: string): Promise<void> {
    this.queue = this.queue.filter((m) => m.id !== id);
    await this.persist();
    this.notify();
  }

  async updateStatus(id: string, status: 'pending' | 'failed'): Promise<void> {
    this.queue = this.queue.map((m) =>
      m.id === id ? { ...m, status } : m,
    );
    await this.persist();
    this.notify();
  }

  // ─── Process queue ─────────────────────────────────────────────────────────

  async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const pending = this.queue.filter((m) => m.status === 'pending');

    for (const msg of pending) {
      try {
        await messagesApi.send(msg.conversationId, {
          content: msg.content,
          type: msg.type,
          clientMessageId: msg.id,
          mediaUrl: msg.mediaUrl,
          mediaMimeType: msg.mediaMimeType,
          mediaSize: msg.mediaSize,
        });
        await this.remove(msg.id);
      } catch {
        const newRetryCount = msg.retryCount + 1;
        if (newRetryCount >= MAX_RETRIES) {
          await this.updateStatus(msg.id, 'failed');
          // Also update retryCount
          this.queue = this.queue.map((m) =>
            m.id === msg.id ? { ...m, retryCount: newRetryCount } : m,
          );
          await this.persist();
        } else {
          this.queue = this.queue.map((m) =>
            m.id === msg.id ? { ...m, retryCount: newRetryCount } : m,
          );
          await this.persist();

          // Exponential backoff
          const delay = Math.min(Math.pow(2, newRetryCount) * 1000, MAX_DELAY_MS);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    this.isProcessing = false;
    this.notify();
  }

  // ─── Persistence ───────────────────────────────────────────────────────────

  async restore(): Promise<void> {
    try {
      const raw = await asyncStorage.getOfflineQueue();
      if (raw) {
        this.queue = JSON.parse(raw) as QueuedMessage[];
        this.notify();
      }
    } catch {
      this.queue = [];
    }
  }

  private async persist(): Promise<void> {
    await asyncStorage.setOfflineQueue(JSON.stringify(this.queue));
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }
}

export const offlineQueueService = new OfflineQueueService();
export default offlineQueueService;
