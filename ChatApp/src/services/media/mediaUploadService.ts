import { launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';
import { pick, types as docTypes } from 'react-native-document-picker';
import apiClient from '../api/apiService';

export interface UploadResult {
  mediaKey: string;
  mediaUrl: string;
  mimeType: string;
  size: number;
  filename: string;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  mediaKey: string;
  expiresAt: string;
}

// Maximum video size: 200MB
const MAX_VIDEO_SIZE = 209715200;

const SUPPORTED_VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const SUPPORTED_VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm']);

export type PickVideoError = 'TOO_LARGE' | 'UNSUPPORTED_FORMAT';

export interface PickVideoResult {
  uri: string;
  mimeType: string;
  fileSize: number;
  duration: number;
  filename: string;
}

// ─── Pick Video ──────────────────────────────────────────────────────────────

export async function pickVideo(): Promise<PickVideoResult | null | PickVideoError> {
  const result: ImagePickerResponse = await launchImageLibrary({
    mediaType: 'video',
    includeExtra: true,
    selectionLimit: 1,
  });

  if (result.didCancel || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const fileSize = asset.fileSize || 0;
  const mimeType = asset.type || '';
  const uri = asset.uri || '';
  const filename = asset.fileName || `video_${Date.now()}.mp4`;
  const duration = asset.duration || 0;

  // Size guard
  if (fileSize > MAX_VIDEO_SIZE) {
    return 'TOO_LARGE';
  }

  // Format guard: check MIME type first, fallback to file extension
  let formatOk = SUPPORTED_VIDEO_MIMES.has(mimeType);
  if (!formatOk) {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    formatOk = SUPPORTED_VIDEO_EXTENSIONS.has(ext);
  }
  if (!formatOk) {
    return 'UNSUPPORTED_FORMAT';
  }

  return { uri, mimeType: mimeType || 'video/mp4', fileSize, duration: Math.round(duration), filename };
}

export async function pickImage(): Promise<{
  uri: string;
  filename: string;
  mimeType: string;
  size: number;
} | null | 'TOO_LARGE'> {
  const result: ImagePickerResponse = await launchImageLibrary({
    mediaType: 'photo',
    selectionLimit: 1,
  });

  if (result.didCancel || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const fileSize = asset.fileSize || 0;

  if (fileSize > MAX_VIDEO_SIZE) {
    return 'TOO_LARGE';
  }

  return {
    uri: asset.uri || '',
    filename: asset.fileName || `image_${Date.now()}.jpg`,
    mimeType: asset.type || 'image/jpeg',
    size: fileSize,
  };
}

// ─── Pick Document ───────────────────────────────────────────────────────────

export async function pickDocument(): Promise<{
  uri: string;
  filename: string;
  mimeType: string;
  size: number;
} | null> {
  try {
    const [result] = await pick({
      type: [docTypes.allFiles],
      allowMultiSelection: false,
    });

    if (!result) return null;

    return {
      uri: result.uri,
      filename: result.name || `file_${Date.now()}`,
      mimeType: result.type || 'application/octet-stream',
      size: result.size || 0,
    };
  } catch {
    // User cancelled or error
    return null;
  }
}

// ─── Request Presigned URL ───────────────────────────────────────────────────

export async function requestPresignedUrl(
  filename: string,
  mimeType: string,
  size: number,
  conversationId?: string,
): Promise<PresignedUrlResponse> {
  const { data } = await apiClient.post('/media/upload', {
    filename,
    mimeType,
    size,
    conversationId,
  });
  return data;
}

// ─── Upload File to MinIO ────────────────────────────────────────────────────

export async function uploadFileToMinIO(
  uploadUrl: string,
  fileUri: string,
  mimeType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  // Use react-native-blob-util for reliable file upload (handles content:// URIs)
  const BlobUtil = require('react-native-blob-util').default;

  // Normalize URI — remove file:// prefix for blob-util
  let path = fileUri;
  if (path.startsWith('file://')) {
    path = path.replace('file://', '');
  }

  // For content:// URIs (Android document picker), copy to temp first
  if (path.startsWith('content://')) {
    const stat = await BlobUtil.fs.stat(path);
    const tempPath = `${BlobUtil.fs.dirs.CacheDir}/upload_${Date.now()}_${stat.filename || 'file'}`;
    await BlobUtil.fs.cp(path, tempPath);
    path = tempPath;
  }

  const task = BlobUtil.fetch('PUT', uploadUrl, {
    'Content-Type': mimeType,
  }, BlobUtil.wrap(path));

  if (onProgress) {
    task.uploadProgress((written: number, total: number) => {
      const percent = total > 0 ? Math.round((written / total) * 100) : 0;
      onProgress(percent);
    });
  }

  await task;
}

// ─── Full Upload Flow ────────────────────────────────────────────────────────

export async function uploadMedia(
  fileUri: string,
  filename: string,
  mimeType: string,
  size: number,
  conversationId?: string,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  // 1. Get presigned URL
  const { uploadUrl, mediaKey } = await requestPresignedUrl(
    filename,
    mimeType,
    size,
    conversationId,
  );

  // 2. Upload file directly to MinIO
  await uploadFileToMinIO(uploadUrl, fileUri, mimeType, onProgress);

  // 3. Construct the media URL (for message reference)
  // The mediaKey is used as reference; actual URL is fetched via GET /media/:mediaKey
  return {
    mediaKey,
    mediaUrl: mediaKey, // Backend will resolve to actual URL
    mimeType,
    size,
    filename,
  };
}

// ─── Get file type category ──────────────────────────────────────────────────

export function getMessageTypeFromMime(mimeType: string): 'image' | 'file' | 'voice' | 'video' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'voice';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}
