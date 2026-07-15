import React from 'react';
// @ts-expect-error react-test-renderer has no type declarations in this project
import { create as render, act } from 'react-test-renderer';
import { useDocumentUpload } from '../useDocumentUpload';
import type { UseDocumentUploadReturn } from '../useDocumentUpload';

// Mock the media upload service
const mockPickImage = jest.fn();
const mockUploadMedia = jest.fn();

jest.mock('../../../../services/media/mediaUploadService', () => ({
  pickImage: (...args: any[]) => mockPickImage(...args),
  uploadMedia: (...args: any[]) => mockUploadMedia(...args),
}));

// Simple test harness: renders the hook result into a ref
let hookResult: UseDocumentUploadReturn;

function TestComponent() {
  hookResult = useDocumentUpload();
  return null;
}

function renderHook() {
  return render(React.createElement(TestComponent));
}

describe('useDocumentUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts in idle state with no confirmed key', () => {
    renderHook();
    expect(hookResult.state.status).toBe('idle');
    expect(hookResult.state.confirmedKey).toBe('');
    expect(hookResult.state.progress).toBe(0);
    expect(hookResult.state.error).toBeNull();
  });

  describe('picker cancellation', () => {
    it('returns to idle when user cancels picker (no prior key)', async () => {
      mockPickImage.mockResolvedValue(null);
      renderHook();

      await act(async () => {
        await hookResult.pickAndUpload();
      });

      expect(hookResult.state.status).toBe('idle');
      expect(hookResult.state.confirmedKey).toBe('');
    });

    it('returns to uploaded state when user cancels picker (prior key exists)', async () => {
      // First, do a successful upload
      mockPickImage.mockResolvedValueOnce({
        uri: 'file://img.jpg',
        filename: 'license.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      });
      mockUploadMedia.mockResolvedValueOnce({
        mediaKey: 'uploads/confirmed-key-1.jpg',
        mediaUrl: 'uploads/confirmed-key-1.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        filename: 'license.jpg',
      });

      renderHook();

      await act(async () => {
        await hookResult.pickAndUpload();
      });
      expect(hookResult.state.status).toBe('uploaded');
      expect(hookResult.state.confirmedKey).toBe('uploads/confirmed-key-1.jpg');

      // Now cancel picker
      mockPickImage.mockResolvedValueOnce(null);
      await act(async () => {
        await hookResult.pickAndUpload();
      });

      // Should return to uploaded with prior key intact
      expect(hookResult.state.status).toBe('uploaded');
      expect(hookResult.state.confirmedKey).toBe('uploads/confirmed-key-1.jpg');
    });
  });

  describe('permission denial / TOO_LARGE', () => {
    it('shows failed state when image is too large and no prior key', async () => {
      mockPickImage.mockResolvedValue('TOO_LARGE');
      renderHook();

      await act(async () => {
        await hookResult.pickAndUpload();
      });

      expect(hookResult.state.status).toBe('failed');
      expect(hookResult.state.error).toContain('20MB');
      expect(hookResult.state.confirmedKey).toBe('');
    });

    it('retains uploaded state when image too large during replacement', async () => {
      // First upload successfully
      mockPickImage.mockResolvedValueOnce({
        uri: 'file://img.jpg',
        filename: 'license.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      });
      mockUploadMedia.mockResolvedValueOnce({
        mediaKey: 'uploads/original.jpg',
        mediaUrl: 'uploads/original.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        filename: 'license.jpg',
      });

      renderHook();
      await act(async () => {
        await hookResult.pickAndUpload();
      });

      // Now try to replace with too-large image
      mockPickImage.mockResolvedValueOnce('TOO_LARGE');
      await act(async () => {
        await hookResult.pickAndUpload();
      });

      // Key is preserved (uploaded state since it has confirmedKey)
      expect(hookResult.state.confirmedKey).toBe('uploads/original.jpg');
      expect(hookResult.state.status).toBe('uploaded');
    });
  });

  describe('upload success', () => {
    it('sets confirmed key from uploadMedia response mediaKey', async () => {
      mockPickImage.mockResolvedValue({
        uri: 'file://license.jpg',
        filename: 'my-license.jpg',
        mimeType: 'image/jpeg',
        size: 5000,
      });
      mockUploadMedia.mockResolvedValue({
        mediaKey: 'uploads/2026/abc123.jpg',
        mediaUrl: 'uploads/2026/abc123.jpg',
        mimeType: 'image/jpeg',
        size: 5000,
        filename: 'my-license.jpg',
      });

      renderHook();

      await act(async () => {
        await hookResult.pickAndUpload();
      });

      expect(hookResult.state.status).toBe('uploaded');
      expect(hookResult.state.confirmedKey).toBe('uploads/2026/abc123.jpg');
      expect(hookResult.state.progress).toBe(100);
      expect(hookResult.state.error).toBeNull();
    });

    it('passes progress callback to uploadMedia', async () => {
      mockPickImage.mockResolvedValue({
        uri: 'file://img.jpg',
        filename: 'img.jpg',
        mimeType: 'image/jpeg',
        size: 2000,
      });
      mockUploadMedia.mockImplementation(
        async (_uri: string, _fn: string, _mime: string, _sz: number, _cid: any, onProgress: any) => {
          if (onProgress) {
            onProgress(50);
            onProgress(100);
          }
          return {
            mediaKey: 'uploads/progress-test.jpg',
            mediaUrl: 'uploads/progress-test.jpg',
            mimeType: 'image/jpeg',
            size: 2000,
            filename: 'img.jpg',
          };
        },
      );

      renderHook();
      await act(async () => {
        await hookResult.pickAndUpload();
      });

      expect(hookResult.state.status).toBe('uploaded');
      expect(hookResult.state.confirmedKey).toBe('uploads/progress-test.jpg');
    });
  });

  describe('upload failure', () => {
    it('transitions to failed state with error message', async () => {
      mockPickImage.mockResolvedValue({
        uri: 'file://img.jpg',
        filename: 'img.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
      });
      mockUploadMedia.mockRejectedValue({
        response: { data: { message: 'Storage quota exceeded' } },
      });

      renderHook();

      await act(async () => {
        await hookResult.pickAndUpload();
      });

      expect(hookResult.state.status).toBe('failed');
      expect(hookResult.state.error).toBe('Storage quota exceeded');
      expect(hookResult.state.confirmedKey).toBe('');
    });

    it('preserves prior valid key on failure during replacement', async () => {
      // First upload
      mockPickImage.mockResolvedValueOnce({
        uri: 'file://img.jpg',
        filename: 'img.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
      });
      mockUploadMedia.mockResolvedValueOnce({
        mediaKey: 'uploads/original-key.jpg',
        mediaUrl: 'uploads/original-key.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
        filename: 'img.jpg',
      });

      renderHook();
      await act(async () => {
        await hookResult.pickAndUpload();
      });
      expect(hookResult.state.confirmedKey).toBe('uploads/original-key.jpg');

      // Replacement fails
      mockPickImage.mockResolvedValueOnce({
        uri: 'file://new.jpg',
        filename: 'new.jpg',
        mimeType: 'image/jpeg',
        size: 2000,
      });
      mockUploadMedia.mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        await hookResult.pickAndUpload();
      });

      // Prior key preserved
      expect(hookResult.state.status).toBe('failed');
      expect(hookResult.state.confirmedKey).toBe('uploads/original-key.jpg');
    });
  });

  describe('retry after failure', () => {
    it('can retry and succeed after a failure', async () => {
      // First attempt fails
      mockPickImage.mockResolvedValueOnce({
        uri: 'file://img.jpg',
        filename: 'img.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
      });
      mockUploadMedia.mockRejectedValueOnce(new Error('timeout'));

      renderHook();
      await act(async () => {
        await hookResult.pickAndUpload();
      });
      expect(hookResult.state.status).toBe('failed');

      // Retry succeeds
      mockPickImage.mockResolvedValueOnce({
        uri: 'file://img.jpg',
        filename: 'img.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
      });
      mockUploadMedia.mockResolvedValueOnce({
        mediaKey: 'uploads/retry-success.jpg',
        mediaUrl: 'uploads/retry-success.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
        filename: 'img.jpg',
      });

      await act(async () => {
        await hookResult.pickAndUpload();
      });

      expect(hookResult.state.status).toBe('uploaded');
      expect(hookResult.state.confirmedKey).toBe('uploads/retry-success.jpg');
    });
  });

  describe('reset', () => {
    it('clears state back to idle', async () => {
      mockPickImage.mockResolvedValue({
        uri: 'file://img.jpg',
        filename: 'img.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
      });
      mockUploadMedia.mockResolvedValue({
        mediaKey: 'uploads/key.jpg',
        mediaUrl: 'uploads/key.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
        filename: 'img.jpg',
      });

      renderHook();
      await act(async () => {
        await hookResult.pickAndUpload();
      });
      expect(hookResult.state.status).toBe('uploaded');

      act(() => {
        hookResult.reset();
      });

      expect(hookResult.state.status).toBe('idle');
      expect(hookResult.state.confirmedKey).toBe('');
    });
  });

  describe('fabricated key prevention', () => {
    it('never produces a timestamp-based license key pattern', async () => {
      mockPickImage.mockResolvedValue({
        uri: 'file://img.jpg',
        filename: 'img.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
      });
      mockUploadMedia.mockResolvedValue({
        mediaKey: 'uploads/real-server-key.jpg',
        mediaUrl: 'uploads/real-server-key.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
        filename: 'img.jpg',
      });

      renderHook();
      await act(async () => {
        await hookResult.pickAndUpload();
      });

      // The key must come from server, not a fabricated pattern
      expect(hookResult.state.confirmedKey).not.toMatch(/^license\/\d+\.jpg$/);
      expect(hookResult.state.confirmedKey).toBe('uploads/real-server-key.jpg');
    });
  });
});
