import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { z } from 'zod';
import apiClient, { onRateLimited } from '../apiClient';
import { PageHeader } from '../components/PageHeader';
import { TableShell } from '../components/TableShell';
import StateBlock from '../components/StateBlock';
import { LoadingState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';

type ServiceKey = 'mongodb' | 'redis' | 'coturn' | 'minio';

interface ServiceCheck {
  status: 'up' | 'down';
  checkedAt: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  checks: Partial<Record<ServiceKey, ServiceCheck>>;
}

const ServiceCheckSchema = z.object({
  status: z.enum(['up', 'down']),
  checkedAt: z.string(),
});

const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string(),
  checks: z.record(z.string(), ServiceCheckSchema).default({}),
});

type HealthError =
  | { kind: 'auth' | 'forbidden' | 'not-found'; message: string }
  | { kind: 'retryable'; rateLimited: boolean; message: string };

const SERVICES: { key: ServiceKey; label: string }[] = [
  { key: 'mongodb', label: 'MongoDB' },
  { key: 'redis', label: 'Redis' },
  { key: 'coturn', label: 'Coturn' },
  { key: 'minio', label: 'MinIO' },
];

const POLL_INTERVAL_MS = 30000;
const RETRY_COOLDOWN_MS = 10000;

function checkTone(status: string) {
  return status === 'up' ? 'success' : 'danger';
}

export default function HealthPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<HealthError | null>(null);
  const [retryCooldown, setRetryCooldown] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const cooldownRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toHealthError = useCallback(
    (err: unknown): HealthError => {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 401) {
          return { kind: 'auth', message: t('health.authExpired') };
        }
        if (status === 403) {
          // Interceptor routes to /forbidden — no retry button (no redirect loop).
          return { kind: 'forbidden', message: t('health.demoted') };
        }
        if (status === 404) {
          return { kind: 'not-found', message: t('health.notFound') };
        }
        if (status === 429) {
          return { kind: 'retryable', rateLimited: true, message: t('health.rateLimited') };
        }
        if (status !== undefined && status >= 500) {
          return { kind: 'retryable', rateLimited: false, message: t('health.serverError') };
        }
      }
      return { kind: 'retryable', rateLimited: false, message: t('health.fetchFailed') };
    },
    [t],
  );

  const startRetryCooldown = useCallback(() => {
    cooldownRef.current = true;
    setRetryCooldown(true);
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      cooldownRef.current = false;
      setRetryCooldown(false);
    }, RETRY_COOLDOWN_MS);
  }, []);

  const fetchHealth = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;
    try {
      const res = await apiClient.get('/admin/health', { signal });
      const parsed = HealthResponseSchema.safeParse(res.data);
      if (signal.aborted) return;
      if (!parsed.success) {
        if (import.meta.env.DEV) console.debug('[HealthPage] invalid payload', parsed.error.issues);
        setError({ kind: 'retryable', rateLimited: false, message: t('health.invalidPayload') });
        return;
      }
      setData(parsed.data);
      setError(null);
    } catch (err) {
      if (signal.aborted) return;
      const healthError = toHealthError(err);
      if (healthError.kind === 'retryable' && healthError.rateLimited) startRetryCooldown();
      setError(healthError);
    }
  }, [startRetryCooldown, toHealthError, t]);

  useEffect(() => {
    void fetchHealth();
    // ponytail: polling 30s thay vì socket.io — health check tần suất thấp, socket là thừa.
    const id = setInterval(() => {
      if (!cooldownRef.current) void fetchHealth();
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      controllerRef.current?.abort();
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, [fetchHealth]);

  // 429 anywhere in the app → toast warning; polling already pauses via cooldown.
  useEffect(() => onRateLimited(() => addToast('warning', t('health.rateLimited'))), [addToast, t]);

  const handleRetry = useCallback(() => {
    void fetchHealth();
  }, [fetchHealth]);

  const overallMessage =
    data?.status === 'degraded' ? t('health.degradedCopy') : data?.status === 'error' ? t('health.errorCopy') : null;
  const overallTone = !data ? 'muted' : data.status === 'ok' ? 'success' : data.status === 'degraded' ? 'warning' : 'danger';
  const showAlert = error && (data || error.kind === 'auth' || error.kind === 'forbidden');
  const showEmptyBlock = !data && error && error.kind !== 'auth' && error.kind !== 'forbidden';
  const retryDisabled = error?.kind === 'retryable' && error.rateLimited && retryCooldown;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t('health.eyebrow')}
        title={t('health.title')}
        description={t('health.description')}
        actions={
          data && (
            <StatusBadge
              tone={overallTone}
              label={data.status === 'ok' ? t('health.stable') : data.status === 'degraded' ? t('health.degraded') : t('health.error')}
            />
          )
        }
      />

      {showAlert && (
        <p className="alert" role="alert">
          {error.message}{' '}
          {error.kind === 'retryable' && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={retryDisabled}
              onClick={handleRetry}
            >
              {t('health.retry')}
            </button>
          )}
        </p>
      )}

      {!data && !error && <LoadingState title={t('health.loading')} />}

      {showEmptyBlock && (
        <StateBlock variant="empty" icon="◎" title={t('health.emptyTitle')} copy={error.message}>
          {error.kind === 'retryable' && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={retryDisabled}
              onClick={handleRetry}
            >
              {t('health.retry')}
            </button>
          )}
        </StateBlock>
      )}

      {data && (
        <>
          {overallMessage && (
            <p className="alert" role="status">
              {overallMessage}
            </p>
          )}
          <TableShell
            title={t('health.servicesTitle')}
            subtitle={t('health.updatedAt', { ts: data.timestamp })}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('health.colService')}</th>
                  <th scope="col">{t('health.colStatus')}</th>
                  <th scope="col">{t('health.colCheckedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {SERVICES.map(({ key, label }) => {
                  const check = data.checks[key];
                  if (!check) {
                    return (
                      <tr key={key}>
                        <td>{label}</td>
                        <td>
                          <StatusBadge tone="muted" label={t('health.noData')} />
                        </td>
                        <td className="cell-meta">—</td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>
                        <StatusBadge
                          tone={checkTone(check.status)}
                          label={check.status === 'up' ? t('health.up') : t('health.down')}
                        />
                      </td>
                      <td className="cell-meta">{check.checkedAt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableShell>
        </>
      )}
    </div>
  );
}
