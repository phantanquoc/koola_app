import { useCallback, useRef, useState } from 'react';
import {
  pickImage,
  uploadMedia,
} from '../../../services/media/mediaUploadService';

/**
 * Upload state machine for a single document/image field.
 *
 * States: idle → selecting → uploading → uploaded
 *                        ↘ failed (retry loops back to selecting/uploading)
 *         uploaded → replacing (keeps prior valid key until replacement succeeds)
 */
export type DocumentUploadStatus =
  | 'idle'
  | 'selecting'
  | 'uploading'
  | 'uploaded'
  | 'failed'
  | 'replacing';

export interface DocumentUploadState {
  status: DocumentUploadStatus;
  /** The confirmed persistent object key from the media service */
  confirmedKey: string;
  /** Upload progress 0-100 (only meaningful during uploading/replacing) */
  progress: number;
  /** Human-readable error message on failure */
  error: string | null;
}

export interface UseDocumentUploadReturn {
  state: DocumentUploadState;
  /** Trigger the picker + upload flow */
  pickAndUpload: () => Promise<void>;
  /** Reset to idle (clears confirmed key) */
  reset: () => void;
}

const INITIAL_STATE: DocumentUploadState = {
  status: 'idle',
  confirmedKey: '',
  progress: 0,
  error: null,
};

export function useDocumentUpload(): UseDocumentUploadReturn {
  const [state, setState] = useState<DocumentUploadState>(INITIAL_STATE);
  const mountedRef = useRef(true);

  // Track mounted for async safety
  const setIfMounted = useCallback(
    (updater: (prev: DocumentUploadState) => DocumentUploadState) => {
      if (mountedRef.current) setState(updater);
    },
    [],
  );

  const pickAndUpload = useCallback(async () => {
    // Determine if this is a replacement (already have a confirmed key)
    const isReplacing = state.confirmedKey !== '';

    setIfMounted((prev) => ({
      ...prev,
      status: 'selecting',
      error: null,
      progress: 0,
    }));

    try {
      const picked = await pickImage();

      // User cancelled picker — return to prior valid state
      if (picked === null) {
        setIfMounted((prev) => ({
          ...prev,
          status: prev.confirmedKey ? 'uploaded' : 'idle',
        }));
        return;
      }

      // Image too large
      if (picked === 'TOO_LARGE') {
        setIfMounted((prev) => ({
          ...prev,
          status: prev.confirmedKey ? 'uploaded' : 'failed',
          error: 'Ảnh vượt quá dung lượng tối đa (20MB)',
        }));
        return;
      }

      // Start upload
      setIfMounted((prev) => ({
        ...prev,
        status: isReplacing ? 'replacing' : 'uploading',
        progress: 0,
        error: null,
      }));

      const result = await uploadMedia(
        picked.uri,
        picked.filename,
        picked.mimeType,
        picked.size,
        undefined, // no conversationId for license/logo uploads
        (percent) => {
          setIfMounted((prev) => ({ ...prev, progress: percent }));
        },
      );

      // Upload succeeded — store confirmed key
      setIfMounted(() => ({
        status: 'uploaded',
        confirmedKey: result.mediaKey,
        progress: 100,
        error: null,
      }));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string | string[] } } };
      const msg = error.response?.data?.message;
      const errorText = Array.isArray(msg)
        ? msg.join(', ')
        : msg || 'Tải lên thất bại. Vui lòng thử lại.';

      // On failure during replacement, keep prior valid key
      setIfMounted((prev) => ({
        ...prev,
        status: 'failed',
        error: errorText,
        progress: 0,
      }));
    }
  }, [state.confirmedKey, setIfMounted]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { state, pickAndUpload, reset };
}
