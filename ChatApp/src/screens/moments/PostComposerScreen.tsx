/**
 * PostComposerScreen.tsx
 *
 * Composer for creating a Moments feed post. Mirrors the MomentComposerScreen
 * flow (pick → caption/audience → publish with idempotency key) but allows
 * multi-asset selection (up to 10 images/videos), each uploaded via
 * `uploadMedia` before a single POST /moments/posts.
 *
 * Publish failure keeps the screen open with inputs preserved + retry.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchImageLibrary } from 'react-native-image-picker';
import Toast from 'react-native-toast-message';
import type { ChatTabStackParamList } from '../../navigation/types';
import { KoolaText, KoolaButton, koolaRadii, useTheme } from '../../ui';
import type { Palette } from '../../ui/theme';
import MentionTextInput from '../../components/moments/MentionTextInput';
import { momentsService } from '../../services/moments/momentsService';
import { uploadMedia } from '../../services/media/mediaUploadService';
import type { AudienceScope, MentionEntry, AudienceList } from '../../services/moments/momentsApi';
import { generateClientId } from '../../utils/clientId';

type ComposerStep = 'media-picker' | 'edit' | 'publishing' | 'error';

type NavProp = NativeStackNavigationProp<ChatTabStackParamList>;
type ComposerRouteProp = RouteProp<ChatTabStackParamList, 'PostComposer'>;

interface PickedAsset {
  uri: string;
  type: 'image' | 'video';
  mimeType: string;
  fileSize: number;
  duration?: number;
  filename: string;
  width?: number;
  height?: number;
}

const MAX_ASSETS = 10;
const MAX_VIDEO_SECONDS = 60;
const MAX_CAPTION = 5000;

const AUDIENCE_LABELS: Record<string, string> = {
  public: 'Công khai',
  connections: 'Người kết nối',
};

const PostComposerScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<ComposerRouteProp>();
  // The route is registered for BOTH modes, so `params` survive from the
  // previous push: `{ postId }` from "Sửa bài viết" would still be there on
  // the next "Bài viết mới" open and turn it into an edit. A `key` forces a
  // fresh instance per mode (and per post), so the mounted screen's params
  // always describe what the user just asked for.
  const editPostId = route.params && route.params.postId ? route.params.postId : null;
  const isEdit = editPostId !== null;
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  // Edit mode seeds from the post already in the service cache (the feed and
  // the menu both came from it); a cold deep link falls back to a fetch.
  const [step, setStep] = useState<ComposerStep>(() =>
    editPostId ? 'edit' : 'media-picker',
  );
  const [assets, setAssets] = useState<PickedAsset[]>([]);
  const [caption, setCaption] = useState('');
  const [mentions, setMentions] = useState<MentionEntry[]>([]);
  const [audienceScope, setAudienceScope] = useState<AudienceScope>('public');
  const [audienceListId, setAudienceListId] = useState<string | null>(null);
  const [audienceLists, setAudienceLists] = useState<AudienceList[]>([]);
  const [showAudiencePicker, setShowAudiencePicker] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});
  const [loadingPost, setLoadingPost] = useState(false);

  const clientPostIdRef = useRef(generateClientId());

  // Seed caption/audience once when editing.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!editPostId || seededRef.current) return;
    seededRef.current = true;
    const cached = momentsService.getState().postsById.get(editPostId);
    if (cached) {
      setCaption(cached.caption ?? '');
      setAudienceScope(cached.audienceScope);
      setAudienceListId(cached.audienceListId);
      return;
    }
    setLoadingPost(true);
    import('../../services/moments/postsApi')
      .then(({ postsApi }) => postsApi.getPostById(editPostId))
      .then((post) => {
        setCaption(post.caption ?? '');
        setAudienceScope(post.audienceScope);
        setAudienceListId(post.audienceListId);
      })
      .catch(() => {
        setErrorMsg('Không tải được bài viết để sửa');
        setStep('error');
      })
      .finally(() => setLoadingPost(false));
  }, [editPostId]);

  // --- Step 1: Multi-asset picker ---
  const handlePickMedia = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'mixed',
        quality: 0.8,
        videoQuality: 'medium',
        selectionLimit: MAX_ASSETS,
        includeExtra: true,
      });
      if (result.didCancel || !result.assets?.length) return;
      const picked: PickedAsset[] = [];
      for (const asset of result.assets.slice(0, MAX_ASSETS)) {
        const isVideo = (asset.type ?? '').startsWith('video/') || asset.duration != null;
        const detectedType: 'image' | 'video' = isVideo ? 'video' : 'image';
        if (isVideo && typeof asset.duration === 'number' && asset.duration > MAX_VIDEO_SECONDS) {
          setErrorMsg('Video dài quá 60 giây');
          setStep('error');
          return;
        }
        picked.push({
          uri: asset.uri ?? '',
          type: detectedType,
          mimeType: asset.type ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
          fileSize: asset.fileSize ?? 0,
          duration: isVideo ? asset.duration : undefined,
          filename: asset.fileName ?? 'post',
          width: asset.width,
          height: asset.height,
        });
      }
      setAssets(picked);
      setStep('edit');
    } catch (err) {
      console.warn('[PostComposerScreen] pickMedia error:', err);
    }
  }, []);

  const handleRemoveAsset = useCallback((index: number) => {
    setAssets((current) => current.filter((_, i) => i !== index));
  }, []);

  // --- Audience picker loading ---
  const handleOpenAudiencePicker = useCallback(async () => {
    try {
      const lists = await momentsService.loadAudienceLists();
      setAudienceLists(Array.isArray(lists) ? lists : []);
    } catch {
      setAudienceLists([]);
    }
    setShowAudiencePicker(true);
  }, []);

  // --- Publish (create) / Save (edit) ---
  const handlePublish = useCallback(async () => {
    if (!caption.trim() && assets.length === 0) {
      setErrorMsg('Bài viết cần có nội dung hoặc ít nhất một ảnh/video');
      setStep('error');
      return;
    }
    if (editPostId) {
      // Edit covers what the API allows to change: caption + audience. Media
      // is immutable after publish (no media-add/remove endpoint).
      setStep('publishing');
      setErrorMsg('');
      try {
        await momentsService.editPost(editPostId, {
          caption: caption.trim(),
          audienceScope,
          audienceListId: audienceScope === 'custom' ? audienceListId ?? undefined : undefined,
        });
        navigation.goBack();
      } catch (err: unknown) {
        setErrorMsg(
          `Lưu thay đổi thất bại: ${err instanceof Error ? err.message : String(err)}`,
        );
        setStep('error');
      }
      return;
    }
    setStep('publishing');
    setErrorMsg('');
    setUploadProgress({});
    try {
      // Upload each asset via presigned URL with per-asset progress.
      // Offline: enqueue local URIs — the outbox dispatcher uploads on
      // reconnect and creates the post with the same clientPostId.
      const NetInfo = (await import('@react-native-community/netinfo')).default;
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        const { momentsService: svc } = await import('../../services/moments/momentsService');
        await svc.createPost({
          caption: caption.trim() ? caption : undefined,
          media: assets.map((a) => ({
            mediaKey: a.uri,
            mediaType: a.type,
            duration: a.duration,
            width: a.width,
            height: a.height,
          })),
          audienceScope,
          audienceListId: audienceListId ?? undefined,
          mentions: mentions.length > 0 ? mentions : undefined,
          clientPostId: clientPostIdRef.current,
        }).catch((err: unknown) => {
          if ((err as { code?: string }).code !== 'QUEUED') throw err;
        });
        Toast.show({
          type: 'info',
          text1: 'Sẽ đăng khi có mạng',
          visibilityTime: 2000,
        });
        navigation.goBack();
        return;
      }
      const media = [];
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        const { mediaKey } = await uploadMedia(
          asset.uri,
          asset.filename,
          asset.mimeType,
          asset.fileSize,
          undefined,
          (percent) => {
            setUploadProgress((prev) => ({ ...prev, [i]: percent }));
          },
        );
        media.push({
          mediaKey,
          mediaType: asset.type,
          duration: asset.duration,
          width: asset.width,
          height: asset.height,
        });
      }
      await momentsService.createPost({
        caption: caption.trim() ? caption : undefined,
        media: media.length > 0 ? media : undefined,
        audienceScope,
        audienceListId: audienceListId ?? undefined,
        mentions: mentions.length > 0 ? mentions : undefined,
        clientPostId: clientPostIdRef.current,
      });
      navigation.goBack();
    } catch (err: unknown) {
      console.error('[PostComposer] publish failed:', err);
      const code = err instanceof Error ? (err as { code?: string }).code : undefined;
      if (code === 'QUEUED') {
        // Text-only post queued for replay — navigate back with a toast.
        // The outbox replays with the same clientPostId (server dedupes).
        Toast.show({
          type: 'info',
          text1: 'Sẽ đăng khi có mạng',
          visibilityTime: 2000,
        });
        navigation.goBack();
        return;
      }
      const msg =
        code === 'OFFLINE'
          ? 'Không có kết nối mạng. Vui lòng thử lại sau.'
          : `Đăng bài viết thất bại: ${err instanceof Error ? err.message : String(err)}`;
      // Stay open with inputs preserved — retry keeps everything
      setErrorMsg(msg);
      setStep('error');
    }
  }, [assets, caption, mentions, audienceScope, audienceListId, navigation, editPostId]);

  const audienceScopeLabel =
    audienceScope === 'custom'
      ? audienceLists.find((l) => l._id === audienceListId)?.name ?? 'Danh sách tùy chỉnh'
      : AUDIENCE_LABELS[audienceScope] ?? 'Công khai';

  if (step === 'media-picker') {
    return (
      <View style={styles.container}>
        <View style={[styles.pickerHeader, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Quay lại">
            <KoolaText tone="primary">Hủy</KoolaText>
          </TouchableOpacity>
          <KoolaText variant="label" weight="700">
            Bài viết mới
          </KoolaText>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.pickerBody}>
          <KoolaButton
            title="Chọn ảnh / video"
            onPress={handlePickMedia}
            icon="add-photo-alternate"
            accessibilityLabel="Chọn ảnh hoặc video từ thư viện"
          />
          <KoolaText variant="caption" tone="muted" align="center" style={styles.hint}>
            Tối đa {MAX_ASSETS} ảnh/video · mỗi video tối đa 60 giây
          </KoolaText>
          <KoolaButton
            title="Viết bài không ảnh"
            onPress={() => setStep('edit')}
            accessibilityLabel="Viết bài văn bản"
          />
        </View>
      </View>
    );
  }

  if (step === 'publishing') {
    const done = Object.keys(uploadProgress).length;
    return (
      <View style={styles.container} accessibilityLiveRegion="polite">
        <ActivityIndicator size="large" color={palette.primary} style={styles.publishingLoader} />
        <KoolaText tone="muted" align="center" style={styles.publishingText}>
          {isEdit
            ? 'Đang lưu thay đổi...'
            : assets.length > 0
            ? `Đang tải lên ${done}/${assets.length}...`
            : 'Đang đăng...'}
        </KoolaText>
      </View>
    );
  }

  if (step === 'error') {
    return (
      <View style={styles.container}>
        <View style={[styles.pickerHeader, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity
            onPress={() => (isEdit ? setStep('edit') : setStep(assets.length > 0 || caption ? 'edit' : 'media-picker'))}
            accessibilityRole="button"
            accessibilityLabel="Quay lại">
            <KoolaText tone="primary">Quay lại</KoolaText>
          </TouchableOpacity>
          <KoolaText variant="label" weight="700">
            Lỗi
          </KoolaText>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorBody}>
          <KoolaText tone="danger" align="center">{errorMsg}</KoolaText>
          <KoolaButton
            title="Thử lại"
            onPress={handlePublish}
            style={styles.retryButton}
            accessibilityLabel={isEdit ? 'Thử lưu lại' : 'Thử đăng lại bài viết'}
          />
        </View>
      </View>
    );
  }

  // step === 'edit'
  return (
    <View style={styles.container}>
      <View style={[styles.pickerHeader, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          onPress={() => (isEdit ? navigation.goBack() : setStep('media-picker'))}
          accessibilityRole="button"
          accessibilityLabel={isEdit ? 'Hủy sửa bài viết' : 'Quay lại chọn ảnh'}>
          <KoolaText tone="primary">{isEdit ? 'Hủy' : 'Quay lại'}</KoolaText>
        </TouchableOpacity>
        <KoolaText variant="label" weight="700">
          {isEdit ? 'Sửa bài viết' : 'Bài viết mới'}
        </KoolaText>
        <TouchableOpacity
          onPress={handlePublish}
          disabled={loadingPost}
          accessibilityRole="button"
          accessibilityLabel={isEdit ? 'Lưu thay đổi' : 'Đăng bài viết'}>
          <KoolaText tone={loadingPost ? 'muted' : 'primary'} weight="700">
            {isEdit ? 'Lưu' : 'Đăng'}
          </KoolaText>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.editContent} keyboardShouldPersistTaps="handled">
        {/* Asset strip */}
        {assets.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assetStrip}>
            {assets.map((asset, i) => (
              <View key={`${asset.uri}-${i}`} style={styles.assetSlot}>
                <Image source={{ uri: asset.uri }} style={styles.assetThumb} resizeMode="cover" />
                {asset.type === 'video' ? (
                  <View style={styles.videoBadge}>
                    <MaterialIcons name="play-arrow" size={16} color="#fff" />
                  </View>
                ) : null}
                {uploadProgress[i] != null && uploadProgress[i] < 100 ? (
                  <View style={styles.progressBadge}>
                    <KoolaText variant="caption" style={{ color: '#fff' }}>
                      {Math.round(uploadProgress[i])}%
                    </KoolaText>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => handleRemoveAsset(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Xóa ảnh ${i + 1}`}>
                  <MaterialIcons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {assets.length < MAX_ASSETS ? (
              <TouchableOpacity
                style={styles.addMoreSlot}
                onPress={handlePickMedia}
                accessibilityRole="button"
                accessibilityLabel="Thêm ảnh">
                <MaterialIcons name="add" size={28} color={palette.muted} />
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        ) : null}

        {/* Caption with mention support */}
        <View style={styles.captionSection}>
          <KoolaText variant="label" tone="muted" style={styles.sectionLabel}>
            Nội dung
          </KoolaText>
          <MentionTextInput
            value={caption}
            onChangeText={(text) => setCaption(text.slice(0, MAX_CAPTION))}
            onMentionsChange={setMentions}
            placeholder="Bạn đang nghĩ gì? Dùng @ để đề cập bạn bè"
            style={styles.captionInput}
            accessibilityLabel="Nhập nội dung bài viết"
          />
          <KoolaText variant="caption" tone="faint" align="right">
            {caption.length}/{MAX_CAPTION}
          </KoolaText>
        </View>

        {/* Audience picker entry */}
        <TouchableOpacity
          style={styles.optionRow}
          onPress={handleOpenAudiencePicker}
          accessibilityRole="button"
          accessibilityLabel={`Đối tượng: ${audienceScopeLabel}`}
          accessibilityHint="Chọn ai có thể xem bài viết này">
          <KoolaText tone="ink">Đối tượng: {audienceScopeLabel}</KoolaText>
          <MaterialIcons name="chevron-right" size={22} color={palette.muted} />
        </TouchableOpacity>
      </ScrollView>

      {/* Audience Picker Modal */}
      <Modal
        visible={showAudiencePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAudiencePicker(false)}>
        <View style={styles.audienceModal} accessibilityViewIsModal>
          <View style={styles.pickerHeader}>
            <TouchableOpacity
              onPress={() => setShowAudiencePicker(false)}
              accessibilityRole="button"
              accessibilityLabel="Đóng">
              <KoolaText tone="primary">Xong</KoolaText>
            </TouchableOpacity>
            <KoolaText variant="label" weight="700">
              Đối tượng
            </KoolaText>
            <View style={{ width: 40 }} />
          </View>
          <FlatList
            removeClippedSubviews={false}
            data={[
              { id: 'public', label: 'Công khai', scope: 'public' as AudienceScope },
              { id: 'connections', label: 'Người kết nối', scope: 'connections' as AudienceScope },
              ...audienceLists.map((l) => ({ id: l._id, label: l.name, scope: 'custom' as AudienceScope })),
            ]}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.audienceItem,
                  audienceScope === item.scope &&
                    (item.scope !== 'custom' || audienceListId === item.id) &&
                    styles.audienceItemSelected,
                ]}
                onPress={() => {
                  setAudienceScope(item.scope);
                  if (item.scope === 'custom') {
                    setAudienceListId(item.id);
                  } else {
                    setAudienceListId(null);
                  }
                  setShowAudiencePicker(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{
                  selected:
                    audienceScope === item.scope &&
                    (item.scope !== 'custom' || audienceListId === item.id),
                }}>
                <KoolaText
                  tone={
                    audienceScope === item.scope &&
                    (item.scope !== 'custom' || audienceListId === item.id)
                      ? 'primary'
                      : 'ink'
                  }>
                  {item.label}
                </KoolaText>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </View>
  );
};

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.canvas,
    },
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
      backgroundColor: palette.surface,
    },
    pickerBody: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    hint: {
      marginTop: 24,
      marginBottom: 16,
    },
    editContent: {
      paddingBottom: 32,
    },
    assetStrip: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    assetSlot: {
      width: 96,
      height: 96,
      borderRadius: koolaRadii.sm,
      overflow: 'hidden',
      marginRight: 8,
      backgroundColor: palette.ink,
    },
    assetThumb: {
      width: 96,
      height: 96,
    },
    videoBadge: {
      position: 'absolute',
      left: 4,
      bottom: 4,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    progressBadge: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      paddingVertical: 2,
    },
    removeBtn: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addMoreSlot: {
      width: 96,
      height: 96,
      borderRadius: koolaRadii.sm,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: palette.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    captionSection: {
      padding: 16,
      backgroundColor: palette.surface,
      marginTop: 16,
    },
    sectionLabel: {
      marginBottom: 8,
    },
    captionInput: {
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: koolaRadii.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: palette.canvas,
      minHeight: 100,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: palette.surface,
      marginTop: 1,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
    },
    publishingLoader: {
      marginTop: 120,
    },
    publishingText: {
      marginTop: 16,
    },
    errorBody: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    retryButton: {
      marginTop: 32,
      minWidth: 160,
    },
    audienceModal: {
      flex: 1,
      backgroundColor: palette.canvas,
    },
    audienceItem: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
    },
    audienceItemSelected: {
      backgroundColor: palette.primarySoft,
    },
  });

export default PostComposerScreen;
