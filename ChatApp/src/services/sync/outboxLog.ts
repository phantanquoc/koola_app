/**
 * outboxLog.ts
 *
 * Structured logging helper for the outbox subsystem.
 *
 * Emits console.log('[outbox]', event, sanitized_fields) and increments
 * the corresponding counter in outbox_metrics.
 *
 * IMPORTANT: Never pass payload_json, URLs, headers, tokens, or stack traces
 * to logOutbox. Only allow-listed fields are safe to log.
 *
 * Allow-listed fields: id, op_type, conversation_id, state, retry_count,
 * backoff_ms, code, now, error_code, count.
 */

type AllowedFields = {
  id?: string;
  op_type?: string;
  conversation_id?: string;
  state?: string;
  retry_count?: number;
  backoff_ms?: number;
  code?: string;
  now?: number;
  error_code?: string;
  count?: number;
  [key: string]: string | number | boolean | undefined;
};

/**
 * Log an outbox event with sanitized fields.
 * Also increments the corresponding counter in outbox_metrics.
 */
export function logOutbox(event: string, fields: AllowedFields = {}): void {
  // Sanitize: only allow primitive scalar values, no objects/arrays
  const safe: AllowedFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      safe[k] = v;
    }
    // Objects/arrays are silently dropped — never log payload content
  }

  console.log('[outbox]', event, safe);

  // Increment metric counter (best-effort — don't throw if DB not ready)
  try {
    // Lazy import to avoid circular dependency at module load time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const repo = require('../db/outboxRepository');
    repo.incrementMetric?.(`log_${event}`);
  } catch {
    // DB not yet initialized — acceptable during early boot
  }
}
