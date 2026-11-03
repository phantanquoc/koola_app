/**
 * Track detail behaviour the workbench spec requires:
 * - save submits only changed fields (never the whole record)
 * - an audio failure refetches exactly once, then surfaces
 * - restore is offered only when the track is inactive
 * - provenance is read-only (no input carries the storage key or license URLs)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import MusicDetail from '../components/MusicDetail';

const { detailMock, updateMock, deactivateMock, restoreMock, auditMock } = vi.hoisted(() => ({
  detailMock: vi.fn(),
  updateMock: vi.fn(),
  deactivateMock: vi.fn(),
  restoreMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('../musicApi', async () => {
  const actual = await vi.importActual<typeof import('../musicApi')>('../musicApi');
  return {
    ...actual,
    musicApi: {
      detail: detailMock,
      update: updateMock,
      deactivate: deactivateMock,
      restore: restoreMock,
    },
    default: undefined,
  };
});

vi.mock('../apiClient', () => ({
  default: { get: auditMock },
}));

function track(over: Record<string, unknown> = {}) {
  return {
    _id: 't1',
    title: 'Rainy Afternoon',
    artist: 'Purrple Cat',
    durationMs: 214_000,
    audioKey: 'music-catalog/a.mp3',
    previewKey: 'music-catalog/a.mp3',
    licenseType: 'cc0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://freemusicarchive.org/x',
    attribution: '',
    addedBy: 'admin1',
    addedAt: '2026-11-02T10:00:00.000Z',
    isActive: true,
    usageCount: 0,
    tags: [],
    audioUrl: 'https://signed.example/a.mp3',
    previewUrl: 'https://signed.example/a.mp3',
    ...over,
  };
}

function renderDetail() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MusicDetail, { id: 't1' }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  detailMock.mockResolvedValue(track());
  auditMock.mockResolvedValue({ data: { data: [] } });
  updateMock.mockResolvedValue(track());
  deactivateMock.mockResolvedValue(undefined);
  restoreMock.mockResolvedValue(undefined);
});

describe('MusicDetail', () => {
  it('renders the track identity', async () => {
    renderDetail();
    expect(await screen.findByText('Rainy Afternoon')).toBeTruthy();
    expect(screen.getByText(/Purrple Cat/)).toBeTruthy();
  });

  it('sends only the changed field on save', async () => {
    renderDetail();
    const titleInput = await screen.findByDisplayValue('Rainy Afternoon');
    fireEvent.change(titleInput, { target: { value: 'Rainy Afternoon (Remaster)' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith('t1', { title: 'Rainy Afternoon (Remaster)' });
  });

  it('disables save when nothing changed', async () => {
    renderDetail();
    const saveBtn = await screen.findByRole('button', { name: /Lưu thay đổi/ });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('never renders the storage key or license URLs as inputs', async () => {
    renderDetail();
    await screen.findByText('Rainy Afternoon');
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')) as HTMLInputElement[];
    const values = inputs.map((i) => i.value);
    expect(values).not.toContain('music-catalog/a.mp3');
    expect(values.some((v) => v.includes('creativecommons'))).toBe(false);
  });

  it('links the license URL when it is http(s)', async () => {
    renderDetail();
    await screen.findByText('Rainy Afternoon');
    const link = screen.getByRole('link', { name: /creativecommons/ }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders a javascript: license URL as text, never as a link', async () => {
    detailMock.mockResolvedValue(track({ licenseUrl: 'javascript:alert(1)' }));
    renderDetail();
    await screen.findByText('Rainy Afternoon');
    expect(screen.queryByRole('link', { name: /javascript/ })).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeTruthy();
  });

  it('makes tags editable and sends them on save', async () => {
    detailMock.mockResolvedValue(track({ tags: ['lofi'] }));
    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: /Bỏ tag lofi/ }));
    fireEvent.change(screen.getByLabelText('Thêm tag'), { target: { value: 'Ambient' } });
    fireEvent.click(screen.getByRole('button', { name: /^Thêm$/ }));
    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith('t1', { tags: ['ambient'] });
  });

  it('does not send tags when the set is unchanged', async () => {
    detailMock.mockResolvedValue(track({ tags: ['lofi'] }));
    renderDetail();
    const titleInput = await screen.findByDisplayValue('Rainy Afternoon');
    fireEvent.change(titleInput, { target: { value: 'Rainy' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith('t1', { title: 'Rainy' });
  });

  it('offers Ngưng when active and Khôi phục only when inactive', async () => {
    renderDetail();
    expect(await screen.findByRole('button', { name: /Ngưng track/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Khôi phục$/ })).toBeNull();
  });

  it('offers Khôi phục for an inactive track', async () => {
    detailMock.mockResolvedValue(track({ isActive: false }));
    renderDetail();
    expect(await screen.findByRole('button', { name: /^Khôi phục$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ngưng track/ })).toBeNull();
  });

  it('requires a confirmation step before deactivating', async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: /Ngưng track/ }));
    expect(deactivateMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Xác nhận ngưng/ }));
    await waitFor(() => expect(deactivateMock).toHaveBeenCalledWith('t1'));
  });
});
