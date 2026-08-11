/**
 * MomentComposerScreen.tsx
 *
 * Multi-step composer for creating a new Khoanh khac (story).
 *
 * Steps:
 *   media-picker  -> preview/edit -> (optional) music-picker -> (optional) audience-picker -> publish
 *
 * States:
 *   'media-picker' | 'preview' | 'music-picker' | 'caption-edit' |
 *   'audience-picker' | 'publishing' | 'error'
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchImageLibrary } from 'react-native-image-picker';
import type { ChatTabStackParamList } from '../../navigation/types';
import { KoolaText, KoolaButton, koolaRadii, useTheme } from '../../ui';
import type { Palette } from '../../ui/theme';
import MentionTextInput from '../../components/moments/MentionTextInput';
import MusicPicker from '../../components/moments/MusicPicker';
import { momentsService } from '../../services/moments/momentsService';
import { uploadMedia } from '../../services/media/mediaUploadService';
import type { AudienceScope, MusicRef, MentionEntry, AudienceList } from '../../services/moments/momentsApi';
import { generateClientId } from '../../utils/clientId';

type ComposerStep =
  | 'media-picker'
  | 'preview'
  | 'music-picker'
  | 'audience-picker'
  | 'publishing'
  | 'error';

type NavProp = NativeStackNavigationProp<ChatTabStackParamList>;

interface PickedMedia {
  uri: string;
  type: 'image' | 'video';
  mimeType: string;
  fileSize: number;
  duration?: number;
  filename: string;
}

const AUDIENCE_LABELS: Record<string, string> = {
  public: 'Công khai',
  connections: 'Người kết nối',
};

const MomentComposerScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [step, setStep] = useState<ComposerStep>('media-picker');
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [mentions, setMentions] = useState<MentionEntry[]>([]);
  const [audienceScope, setAudienceScope] = useState<AudienceScope>('public');
  const [audienceListId, setAudienceListId] = useState<string | null>(null);
  const [audienceLists, setAudienceLists] = useState<AudienceList[]>([]);
  const [musicRef, setMusicRef] = useState<MusicRef | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [showAudiencePicker, setShowAudiencePicker] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const clientStoryIdRef = useRef(generateClientId());

  // --- Step 1: Media Picker ---
  const handlePickMedia = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'mixed',
        quality: 0.8,
        videoQuality: 'medium',
        selectionLimit: 1,
        includeExtra: true,
      });
      if (result.didCancel || !result.assets?.length) return;
      const asset = result.assets[0];
      const isVideo = (asset.type ?? '').startsWith('video/') || asset.duration != null;
      const detectedType: 'image' | 'video' = isVideo ? 'video' : 'image';
      if (isVideo && typeof asset.duration === 'number' && asset.duration > 60) {
        setErrorMsg('Video dài quá 60 giây');
        setStep('error');
        return;
      }
      setMedia({
        uri: asset.uri ?? '',
        type: detectedType,
        mimeType: asset.type ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
        fileSize: asset.fileSize ?? 0,
        duration: isVideo ? asset.duration : undefined,
        filename: asset.fileName ?? 'moment',
      });
      setStep('preview');
    } catch (err) {
      console.warn('[MomentComposerScreen] pickMedia error:', err);
    }
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
/* COMPOSER_PUBLISH_PLACEHOLDER */

  // --- Publish ---
  const handlePublish = useCallback(async () => {
    if (!media) return;
    setStep('publishing');
    setErrorMsg('');
    try {
      const { mediaKey } = await uploadMedia(
        media.uri,
        media.filename,
        media.mimeType,
        media.fileSize,
      );
      await momentsService.createStory({
        mediaKey,
        mediaType: media.type,
        duration: media.duration,
        caption,
        audienceScope,
        audienceListId: audienceListId ?? undefined,
        musicRef: musicRef ?? undefined,
        clientStoryId: clientStoryIdRef.current,
        mentions: mentions.length > 0 ? mentions : undefined,
      });
      navigation.goBack();
    } catch (err: unknown) {
      const ax = err as {
        message?: string;
        config?: { url?: string; method?: string; data?: unknown };
        response?: { status?: number; data?: unknown };
      };
      console.error('[MomentComposer] publish failed:', {
        message: ax.message,
        url: ax.config?.url,
        method: ax.config?.method,
        requestData: ax.config?.data,
        responseStatus: ax.response?.status,
        responseData: ax.response?.data,
      });
      const detail = ax.response?.data
        ? (typeof ax.response.data === 'string'
          ? ax.response.data
          : JSON.stringify(ax.response.data))
        : ax.message ?? String(err);
      const msg =
        err instanceof Error && (err as { code?: string }).code === 'OFFLINE'
          ? 'Không có kết nối mạng. Vui lòng thử lại sau.'
          : `Đăng khoảnh khắc thất bại: ${detail}`;
      setErrorMsg(msg);
      setStep('error');
    }
  }, [media, caption, mentions, audienceScope, audienceListId, musicRef, navigation]);

  // --- Render helpers ---
  const audienceScopeLabel =
    audienceScope === 'custom'
      ? audienceLists.find((l) => l._id === audienceListId)?.name ?? 'Danh sách tùy chỉnh'
      : AUDIENCE_LABELS[audienceScope] ?? 'Công khai';
/* COMPOSER_RENDER_PLACEHOLDER */

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
            Khoảnh khắc mới
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
            Ảnh hoặc video tối đa 60 giây
          </KoolaText>
        </View>
      </View>
    );
  }

  if (step === 'publishing') {
    return (
      <View style={styles.container} accessibilityLiveRegion="polite">
        <ActivityIndicator size="large" color={palette.primary} style={styles.publishingLoader} />
        <KoolaText tone="muted" align="center" style={styles.publishingText}>
          Đang đăng...
        </KoolaText>
      </View>
    );
  }

  if (step === 'error') {
    return (
      <View style={styles.container}>
        <View style={[styles.pickerHeader, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity
            onPress={() => setStep('preview')}
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
            accessibilityLabel="Thử đăng lại khoảnh khắc"
          />
        </View>
      </View>
    );
  }

  // step === 'preview'
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.pickerHeader, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          onPress={() => setStep('media-picker')}
          accessibilityRole="button"
          accessibilityLabel="Quay lại chọn ảnh">
          <KoolaText tone="primary">Quay lại</KoolaText>
        </TouchableOpacity>
        <KoolaText variant="label" weight="700">
          Xem trước
        </KoolaText>
        <TouchableOpacity
          onPress={handlePublish}
          accessibilityRole="button"
          accessibilityLabel="Đăng khoảnh khắc">
          <KoolaText tone="primary" weight="700">
            Đăng
          </KoolaText>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.previewContent} keyboardShouldPersistTaps="handled">
        {/* Media preview */}
        {media && (media.type === 'image' ? (
          <Image
            source={{ uri: media.uri }}
            style={styles.previewMedia}
            resizeMode="cover"
            accessibilityLabel="Ảnh xem trước"
          />
        ) : (
          <View style={styles.videoPreviewFrame}>
            <MaterialIcons name="videocam" size={40} color={palette.faint} />
            <KoolaText variant="label" tone="muted" align="center" style={styles.videoPreviewLabel}>
              Video đã chọn
            </KoolaText>
            <KoolaText variant="caption" tone="faint" align="center">
              {media.duration != null ? `${Math.round(media.duration)}s` : ''}
            </KoolaText>
          </View>
        ))}

        {/* Caption with mention support */}
        <View style={styles.captionSection}>
          <KoolaText variant="label" tone="muted" style={styles.sectionLabel}>
            Chú thích
          </KoolaText>
          <MentionTextInput
            value={caption}
            onChangeText={setCaption}
            onMentionsChange={setMentions}
            placeholder="Thêm chú thích... Dùng @ để đề cập bạn bè"
            style={styles.captionInput}
            accessibilityLabel="Nhập chú thích"
          />
          <KoolaText variant="caption" tone="muted" style={{ marginTop: 4, paddingHorizontal: 4 }}>
            Chọn người từ danh sách gợi ý để nhắc tên họ.
          </KoolaText>
          <KoolaText variant="caption" tone="faint" align="right">
            {caption.length}/500
          </KoolaText>
          {caption.length > 500 ? (
            <KoolaText variant="caption" tone="danger" align="right">
              Chú thích vượt quá 500 ký tự
            </KoolaText>
          ) : null}
        </View>

        {/* Music picker entry */}
        <TouchableOpacity
          style={styles.optionRow}
          onPress={() => setShowMusicPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={musicRef ? 'Thay đổi nhạc' : 'Thêm nhạc'}
          accessibilityHint="Mở thư viện nhạc KOOLA">
          <KoolaText tone={musicRef ? 'primary' : 'ink'}>
            {musicRef ? 'Nhạc đã chọn' : 'Thêm nhạc'}
          </KoolaText>
          <MaterialIcons name="chevron-right" size={22} color={palette.muted} />
        </TouchableOpacity>

        {/* Audience picker entry */}
        <TouchableOpacity
          style={styles.optionRow}
          onPress={handleOpenAudiencePicker}
          accessibilityRole="button"
          accessibilityLabel={`Đối tượng: ${audienceScopeLabel}`}
          accessibilityHint="Chọn ai có thể xem khoảnh khắc này">
          <KoolaText tone="ink">Đối tượng: {audienceScopeLabel}</KoolaText>
          <MaterialIcons name="chevron-right" size={22} color={palette.muted} />
        </TouchableOpacity>
      </ScrollView>

      {/* Music picker modal */}
      <MusicPicker
        visible={showMusicPicker}
        onSelect={(ref) => setMusicRef(ref)}
        onClose={() => setShowMusicPicker(false)}
        currentRef={musicRef}
      />

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
            data={[
              { id: 'public', label: 'Công khai', scope: 'public' as AudienceScope },
              { id: 'connections', label: 'Người kết nối', scope: 'connections' as AudienceScope },
              ...audienceLists.map((l) => ({ id: l._id, label: l.name, scope: 'custom' as AudienceScope })),
              { id: '_new', label: '+ Tạo danh sách mới', scope: 'custom' as AudienceScope },
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
                  if (item.id === '_new') {
                    setShowAudiencePicker(false);
                    navigation.push('AudienceListEditor', {});
                    return;
                  }
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
                      : item.id === '_new'
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
/* COMPOSER_STYLES_PLACEHOLDER */

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
    },
    previewContent: {
      paddingBottom: 32,
    },
    previewMedia: {
      width: '100%',
      aspectRatio: 9 / 16,
      backgroundColor: palette.ink,
    },
    videoPreviewFrame: {
      width: '100%',
      aspectRatio: 9 / 16,
      backgroundColor: palette.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    videoPreviewLabel: {
      marginTop: 12,
      marginBottom: 8,
    },
    captionSection: {
      padding: 16,
      backgroundColor: palette.surface,
      marginTop: 1,
    },
    sectionLabel: {
      marginBottom: 8,
    },
/* COMPOSER_STYLES_PART2 */
    captionInput: {
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: koolaRadii.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: palette.canvas,
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
      backgroundColor: palette.surface,
    },
    audienceItemSelected: {
      backgroundColor: palette.primarySoft,
    },
  });

export default MomentComposerScreen;
