/**
 * HealthPage tests: status chips từ GET /admin/health, lỗi theo status,
 * click retry refetch, payload thiếu 1 check render badge muted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import axios from 'axios';
import apiClient from '../apiClient';
import HealthPage from '../pages/HealthPage';
import { ToastProvider } from '../components/Toast';
import '../i18n';

vi.mock('../apiClient', () => ({
  default: { get: vi.fn() },
  onRateLimited: () => () => undefined,
  isRateLimited: () => false,
}));

const mockedGet = vi.mocked(apiClient.get);

const okPayload = {
  status: 'ok',
  timestamp: '2026-10-16T00:00:00.000Z',
  checks: {
    mongodb: { status: 'up', checkedAt: '2026-10-16T00:00:00.000Z' },
    redis: { status: 'up', checkedAt: '2026-10-16T00:00:00.000Z' },
    coturn: { status: 'up', checkedAt: '2026-10-16T00:00:00.000Z' },
    minio: { status: 'up', checkedAt: '2026-10-16T00:00:00.000Z' },
  },
};

function axiosErrorWithStatus(status: number) {
  const err = new axios.AxiosError('Request failed');
  err.response = { status, data: {}, statusText: '', headers: {}, config: {} as never };
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

function renderHealth() {
  return render(createElement(ToastProvider, null, createElement(HealthPage)));
}

describe('HealthPage', () => {
  it('renders status chips for mongodb/redis/coturn/minio from GET /admin/health', async () => {
    mockedGet.mockResolvedValueOnce({ data: okPayload });
    renderHealth();

    expect(mockedGet).toHaveBeenCalledWith('/admin/health', expect.anything());
    await waitFor(() => {
      expect(screen.getByText('MongoDB')).toBeTruthy();
      expect(screen.getByText('Redis')).toBeTruthy();
      expect(screen.getByText('Coturn')).toBeTruthy();
      expect(screen.getByText('MinIO')).toBeTruthy();
    });
    expect(screen.getAllByText('Hoạt động')).toHaveLength(4);
    expect(screen.getByText('Ổn định')).toBeTruthy();
  });

  it('shows degraded message when overall status is degraded', async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        ...okPayload,
        status: 'degraded',
        checks: { ...okPayload.checks, minio: { status: 'down', checkedAt: okPayload.timestamp } },
      },
    });
    renderHealth();

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeTruthy();
    });
    expect(screen.getByText('Suy giảm')).toBeTruthy();
    expect(screen.getByText('Gián đoạn')).toBeTruthy();
  });

  it('shows empty state with retry when request fails with no data', async () => {
    mockedGet.mockRejectedValueOnce(new Error('network'));
    renderHealth();

    await waitFor(() => {
      expect(screen.getByText('Chưa có dữ liệu sức khỏe')).toBeTruthy();
    });
    expect(screen.getAllByText(/Không thể tải trạng thái hệ thống/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });

  it('clicking retry refetches and renders data on success', async () => {
    mockedGet.mockRejectedValueOnce(new Error('network'));
    renderHealth();

    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    mockedGet.mockResolvedValueOnce({ data: okPayload });
    fireEvent.click(retry);

    await waitFor(() => {
      expect(screen.getAllByText('Hoạt động')).toHaveLength(4);
    });
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('renders muted badge row when payload is missing one check', async () => {
    const { mongodb, redis, coturn } = okPayload.checks;
    const checksWithoutMinio = { mongodb, redis, coturn };
    mockedGet.mockResolvedValueOnce({ data: { ...okPayload, checks: checksWithoutMinio } });
    renderHealth();

    await waitFor(() => {
      expect(screen.getByText('MinIO')).toBeTruthy();
    });
    expect(screen.getByText('Không có dữ liệu')).toBeTruthy();
    expect(screen.getAllByText('Hoạt động')).toHaveLength(3);
  });

  it('shows rate-limit message and disables retry temporarily on 429', async () => {
    mockedGet.mockRejectedValueOnce(axiosErrorWithStatus(429));
    renderHealth();

    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    expect(screen.getByText('Thao tác quá nhanh, thử lại sau.')).toBeTruthy();
    expect(retry.hasAttribute('disabled')).toBe(true);
    fireEvent.click(retry);
    // Disabled nên không gọi thêm request nào
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('shows demote message without retry button on 403', async () => {
    mockedGet.mockRejectedValueOnce(axiosErrorWithStatus(403));
    renderHealth();

    await waitFor(() => {
      expect(screen.getByText(/bị hạ quyền quản trị/)).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});
