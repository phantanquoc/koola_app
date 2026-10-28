import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConfigPage from '../pages/ConfigPage';
import { ToastProvider } from '../components/Toast';

vi.mock('../useAuth', () => ({ useAdminRole: () => 'super' }));

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ConfigPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const get = vi.fn();

vi.mock('../apiClient', () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
    patch: vi.fn(),
  },
}));

const config = {
  maintenanceMode: false,
  maintenanceMessage: '',
  forceUpdate: {
    android: { minVersion: '', message: '' },
    ios: { minVersion: '', message: '' },
  },
  featureFlags: {},
  announcement: { title: '', body: '', active: false, at: null },
};

/** Ô phiên bản lọc ký tự không phải số/chấm, nên phải gõ qua `change` thật. */
function typeVersion(label: RegExp, value: string) {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input;
}

describe('ConfigPage — gợi ý phiên bản từ dữ liệu thật', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockImplementation((url: string) => {
      if (url === '/admin/config') return Promise.resolve({ data: config });
      if (url === '/admin/client-versions') {
        return Promise.resolve({
          data: {
            data: [
              { platform: 'android', version: '2.1.0', users: 40, recentlyActive: 38 },
              { platform: 'android', version: '1.9.0', users: 5, recentlyActive: 2 },
              { platform: 'ios', version: '2.0.0', users: 10, recentlyActive: 9 },
            ],
            reporters: 55,
            unknown: 61,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('chưa nhập mốc → hiện bản mới nhất đang chạy', async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getAllByText(/Bản mới nhất đang chạy/).length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText('2.1.0').length).toBeGreaterThan(0);
  });

  // Điểm chính: biết trước mốc này chặn bao nhiêu người, thay vì đoán.
  it('nhập mốc 2.0.0 → nói rõ chặn 5 người đang chạy 1.9.0', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Phiên bản tối thiểu · Android/)).toBeTruthy());

    typeVersion(/Phiên bản tối thiểu · Android/, '2.0.0');

    await waitFor(() =>
      expect(screen.getByText(/Chặn/).textContent).toContain('5 người'),
    );
    expect(screen.getByText(/Chặn/).textContent).toContain('1.9.0');
  });

  it('mốc thấp hơn mọi bản đang chạy → báo không ai bị chặn', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Phiên bản tối thiểu · iOS/)).toBeTruthy());

    typeVersion(/Phiên bản tối thiểu · iOS/, '1.0.0');

    await waitFor(() =>
      expect(screen.getByText(/Không ai bị chặn/)).toBeTruthy(),
    );
  });

  // So chuỗi thì "2.0.10" < "2.0.9" — kiểm bằng ca thực tế này.
  it('so sánh theo số: mốc 2.0.9 không chặn bản 2.0.10', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/admin/config') return Promise.resolve({ data: config });
      if (url === '/admin/client-versions') {
        return Promise.resolve({
          data: {
            data: [{ platform: 'android', version: '2.0.10', users: 3, recentlyActive: 3 }],
            reporters: 3,
            unknown: 0,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Phiên bản tối thiểu · Android/)).toBeTruthy());

    typeVersion(/Phiên bản tối thiểu · Android/, '2.0.9');

    await waitFor(() => expect(screen.getByText(/Không ai bị chặn/)).toBeTruthy());
  });
});
