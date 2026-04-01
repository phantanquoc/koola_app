import { Injectable } from '@nestjs/common';

@Injectable()
export class TypingService {
  private typingTimers = new Map<string, NodeJS.Timeout>();
  private readonly TIMEOUT_MS = 5000;

  private getTypingKey(convId: string, userId: string): string {
    return `${convId}:${userId}`;
  }

  startTyping(convId: string, userId: string): void {
    const key = this.getTypingKey(convId, userId);

    // Clear any existing timer for this user+conversation
    const existing = this.typingTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new 5-second timer
    const timer = setTimeout(() => {
      this.typingTimers.delete(key);
      this.onTypingStopCallback(convId, userId);
    }, this.TIMEOUT_MS);

    this.typingTimers.set(key, timer);
  }

  stopTyping(convId: string, userId: string): void {
    const key = this.getTypingKey(convId, userId);
    const timer = this.typingTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.typingTimers.delete(key);
    }
  }

  private onTypingStopCallback: (convId: string, userId: string) => void =
    () => {};

  setTypingStopCallback(
    callback: (convId: string, userId: string) => void,
  ): void {
    this.onTypingStopCallback = callback;
  }
}
