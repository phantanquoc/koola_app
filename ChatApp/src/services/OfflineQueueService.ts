/**
 * OfflineQueueService — singleton queue manager for offline message sending.
 *
 * Messages sent while offline are persisted to AsyncStorage and retried
 * automatically on reconnect with exponential backoff (max 5 retries).
 */
import { storage } from '../utils/asyncStorage';
import { messagesApi } from './api/apiService';

const STORAGE_KEY_QUEUE = 'offline_queue';
const MAX_RETRIES = 5;

export interface QueuedMessage {
  id: string;               // clientMessageId (UUID)
  conversationId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'voice' | 'system';
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaSize?: number;
  status: 'pending' | 'failed';
  createdAt: string;        // ISO8601
  retryCount: number;        // 0–5
  tempId: string;           // UI-facing temp ID (e.g. "temp_<uuid>")
}

type QueueListener = () => void;

class OfflineQueueServiceImpl {
  private queue: QueuedMessage[] = [];
  private listeners = new Set<QueueListener>();
  private isProcessing = false;

  // ─── Init ────────────────────────────────────────────────────────────────────

  async restore(): Promise<void> {
    const persisted: QueuedMessage[] = await storage.getOfflineQueue();
    // Keep all messages — pending for auto-retry, failed for manual retry
    this.queue = persisted;
  }

  // ─── Queue Operations ───────────────────────────────────────────────────────

  async add(msg: Omit<QueuedMessage, 'status' | 'retryCount'>): Promise<void> {
    const queued: QueuedMessage = {
      ...msg,
      status: 'pending',
      retryCount: 0,
    };
    this.queue.push(queued);
    await this.persist();
    this.notifyListeners();
  }

  async remove(id: string): Promise<void> {
    this.queue = this.queue.filter((m) => m.id !== id);
    await this.persist();
    this.notifyListeners();
  }

  async updateStatus(id: string, status: 'pending' | 'failed'): Promise<void> {
    const idx = this.queue.findIndex((m) => m.id === id);
    if (idx === -1) return;
    this.queue[idx] = { ...this.queue[idx], status };
    await this.persist();
    this.notifyListeners();
  }

  async incrementRetryCount(id: string): Promise<QueuedMessage | null> {
    const idx = this.queue.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    const next = this.queue[idx].retryCount + 1;
    this.queue[idx] = { ...this.queue[idx], retryCount: next };
    await this.persist();
    return this.queue[idx];
  }

  async resetRetryCount(id: string): Promise<void> {
    const idx = this.queue.findIndex((m) => m.id === id);
    if (idx === -1) return;
    this.queue[idx] = { ...this.queue[idx], retryCount: 0 };
    await this.persist();
  }

  getAll(): QueuedMessage[] {
    return [...this.queue];
  }

  // ─── Queue Processing ───────────────────────────────────────────────────────

  /**
   * Process all pending messages in the queue.
   * Iterates sequentially with exponential backoff.
   * Removes a message from the queue on success (HTTP 200) or after max retries.
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const pending = this.queue.filter((m) => m.status === 'pending');
      for (const msg of pending) {
        await this.processMessage(msg);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processMessage(msg: QueuedMessage): Promise<void> {
    try {
      await messagesApi.send(msg.conversationId, {
        type: msg.type,
        content: msg.content,
        mediaUrl: msg.mediaUrl,
        mediaMimeType: msg.mediaMimeType,
        mediaSize: msg.mediaSize,
        clientMessageId: msg.id,
      });
      // Success — remove from queue
      await this.remove(msg.id);
    } catch {
      // Failure — increment retry count
      const updated = await this.incrementRetryCount(msg.id);
      if (!updated) return;

      if (updated.retryCount >= MAX_RETRIES) {
        // Max retries reached — mark as failed
        await this.updateStatus(msg.id, 'failed');
      } else {
        // Apply exponential backoff: min(2^retryCount * 1000, 30000)
        const delayMs = Math.min(Math.pow(2, updated.retryCount) * 1000, 30000);
        await this.sleep(delayMs);
        // Re-process (status still pending, retryCount updated)
        await this.processMessage(updated);
      }
    }
  }

  // ─── Listeners ──────────────────────────────────────────────────────────────

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─── Persistence ────────────────────────────────────────────────────────────

  private async persist(): Promise<void> {
    await storage.setOfflineQueue(this.queue);
  }

  private notifyListeners(): void {
    this.listeners.forEach((l) => l());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const offlineQueueService = new OfflineQueueServiceImpl();
