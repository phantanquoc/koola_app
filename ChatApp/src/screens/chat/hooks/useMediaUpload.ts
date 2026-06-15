import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import {
  pickImage,
  pickDocument,
  pickVideo,
  uploadMedia,
  compressVideo,
  getMessageTypeFromMime,
} from '../../../services/media/mediaUploadService';

type MediaMessageType = 'image' | 'file' | 'voice' | 'video';

interface UseMediaUploadArgs {
  conversationId: string;
  createOptimisticMedia: (
    uri: string,
    mimeType: string,
    size: number,
    messageType: MediaMessageType,
    filename?: string,
    duration?: number,
  ) => string;
  confirmMediaMessage: (
    tempId: string,
    mediaUrl: string,
    mimeType: string,
    size: number,
    messageType: MediaMessageType,
    filename?: string,
    duration?: number,
  ) => Promise<void>;
  updateUploadProgress: (tempId: string, percent: number) => void;
}

interface UseMediaUploadResult {
  isUploading: boolean;
  uploadProgress: number;
  handlePickImage: () => Promise<void>;
  handlePickDocument: () => Promise<void>;
  handlePickVideo: () => Promise<void>;
}

function extractErrorMessage(err: unknown, fallback: string): string {
  const error = err as {
    response?: { data?: { message?: string | string[] } };
  };
  const msg = error.response?.data?.message;
  if (Array.isArray(msg)) return msg.join('\n');
  return msg || fallback;
}

export function useMediaUpload({
  conversationId,
  createOptimisticMedia,
  confirmMediaMessage,
  updateUploadProgress,
}: UseMediaUploadArgs): UseMediaUploadResult {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handlePickImage = useCallback(async () => {
    try {
      const picked = await pickImage();
      if (picked === null) return;
      if (picked === 'TOO_LARGE') {
        Alert.alert('Ảnh quá lớn', 'Vui lòng chọn ảnh dưới 200MB');
        return;
      }

      const messageType = getMessageTypeFromMime(picked.mimeType);
      const tempId = createOptimisticMedia(
        picked.uri,
        picked.mimeType,
        picked.size,
        messageType,
      );

      setIsUploading(true);
      setUploadProgress(0);
      const result = await uploadMedia(
        picked.uri,
        picked.filename,
        picked.mimeType,
        picked.size,
        conversationId,
        (percent) => {
          setUploadProgress(percent);
          updateUploadProgress(tempId, percent);
        },
      );
      await confirmMediaMessage(
        tempId,
        result.mediaUrl,
        result.mimeType,
        result.size,
        messageType,
      );
    } catch (err: unknown) {
      Alert.alert(
        'Tải lên thất bại',
        extractErrorMessage(err, 'Không thể tải ảnh lên'),
      );
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [
    conversationId,
    createOptimisticMedia,
    confirmMediaMessage,
    updateUploadProgress,
  ]);

  const handlePickDocument = useCallback(async () => {
    try {
      const picked = await pickDocument();
      if (!picked) return;

      const messageType = getMessageTypeFromMime(picked.mimeType);
      const tempId = createOptimisticMedia(
        picked.uri,
        picked.mimeType,
        picked.size,
        messageType,
        picked.filename,
      );

      setIsUploading(true);
      setUploadProgress(0);
      const result = await uploadMedia(
        picked.uri,
        picked.filename,
        picked.mimeType,
        picked.size,
        conversationId,
        (percent) => {
          setUploadProgress(percent);
          updateUploadProgress(tempId, percent);
        },
      );
      await confirmMediaMessage(
        tempId,
        result.mediaUrl,
        result.mimeType,
        result.size,
        messageType,
        picked.filename,
      );
    } catch (err: unknown) {
      Alert.alert(
        'Tải lên thất bại',
        extractErrorMessage(err, 'Không thể tải tệp lên'),
      );
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [
    conversationId,
    createOptimisticMedia,
    confirmMediaMessage,
    updateUploadProgress,
  ]);

  const handlePickVideo = useCallback(async () => {
    try {
      const pickResult = await pickVideo();

      if (pickResult === null) return;

      if (pickResult === 'TOO_LARGE') {
        Alert.alert('Video quá lớn', 'Vui lòng chọn video dưới 200MB');
        return;
      }

      if (pickResult === 'UNSUPPORTED_FORMAT') {
        Alert.alert(
          'Định dạng không hỗ trợ',
          'Vui lòng chọn video MP4, MOV hoặc WebM',
        );
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);

      let compressedUri = pickResult.uri;
      try {
        const handle = compressVideo(pickResult.uri, (progress) => {
          setUploadProgress(Math.round(progress * 50));
        });
        compressedUri = await handle.promise;
      } catch (compressErr) {
        console.warn(
          '[useMediaUpload] Video compression failed, using original:',
          compressErr,
        );
        compressedUri = pickResult.uri;
      }

      const tempId = createOptimisticMedia(
        compressedUri,
        pickResult.mimeType,
        pickResult.fileSize,
        'video',
        undefined,
        pickResult.duration,
      );

      const result = await uploadMedia(
        compressedUri,
        pickResult.filename,
        pickResult.mimeType,
        pickResult.fileSize,
        conversationId,
        (percent) => {
          const overall = 50 + Math.round(percent / 2);
          setUploadProgress(overall);
          updateUploadProgress(tempId, overall);
        },
      );
      await confirmMediaMessage(
        tempId,
        result.mediaUrl,
        result.mimeType,
        result.size,
        'video',
        undefined,
        pickResult.duration,
      );
    } catch (err: unknown) {
      Alert.alert(
        'Tải lên thất bại',
        extractErrorMessage(err, 'Không thể tải video lên'),
      );
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [
    conversationId,
    createOptimisticMedia,
    confirmMediaMessage,
    updateUploadProgress,
  ]);

  return {
    isUploading,
    uploadProgress,
    handlePickImage,
    handlePickDocument,
    handlePickVideo,
  };
}
