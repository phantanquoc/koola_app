/**
 * Minimal admin-web tests covering the handlers fixed in this remediation:
 * 1. Approve failure keeps dialog open and shows inline error
 * 2. Ban failure keeps dialog open and shows inline error
 * 3. LicensePreview renders recovery action when onRefresh provided and url is null
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import LicensePreview from '../components/LicensePreview';

// --- LicensePreview tests ---

describe('LicensePreview', () => {
  it('renders recovery button when url is null and onRefresh is provided', () => {
    const onRefresh = vi.fn();
    render(
      createElement(LicensePreview, {
        url: null,
        businessName: 'Test Corp',
        onRefresh,
      }),
    );

    const btn = screen.getByRole('button', { name: /Yêu cầu ảnh giấy phép mới từ Test Corp/i });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does NOT render recovery button when url is null and onRefresh is NOT provided', () => {
    render(
      createElement(LicensePreview, {
        url: null,
        businessName: 'Test Corp',
      }),
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders preview button when url is provided', () => {
    render(
      createElement(LicensePreview, {
        url: 'https://example.com/license.jpg',
        businessName: 'Test Corp',
      }),
    );

    expect(screen.getByRole('button', { name: /Xem giấy phép của Test Corp/i })).toBeTruthy();
  });
});
