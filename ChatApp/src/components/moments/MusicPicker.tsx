/**
 * MusicPicker.tsx
 *
 * Full-screen modal for picking a music track from the KOOLA library.
 * Shows trending tracks, search, preview play, and start-offset slider.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Video from 'react-native-video';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { KoolaText, KoolaButton, koolaColors, koolaRadii, koolaSpacing } from '../../ui';
import { momentsService } from '../../services/moments/momentsService';
import type { MusicTrack, MusicRef } from '../../services/moments/momentsApi';

interface MusicPickerProps {
  visible: boolean;
  onSelect: (ref: MusicRef | null) => void;
  onClose: () => void;
  currentRef?: MusicRef | null;
}

const LICENSE_LABELS: Record<string, string> = {
  cc0: 'Public domain',
  'cc-by': 'CC BY',
  'epidemic-sound': 'Epidemic Sound — licensed',
  'owned-by-koola': '',
};

const getLicenseLabel = (item: MusicTrack): string => {
  if (item.licenseType === 'cc-by' && item.attribution) {
    return item.attribution;
  }
  return LICENSE_LABELS[item.licenseType] ?? '';
};

const MusicPicker: React.FC<MusicPickerProps> = ({
  visible,
  onSelect,
  onClose,
  currentRef,
}) => {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const [startMs, setStartMs] = useState(0);
  // Track currently previewing (id of the row whose preview audio is playing).
  // Null = nothing playing. Only one preview plays at a time.
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const searchTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop any preview when the modal closes so audio never leaks across screens.
  useEffect(() => {
    if (!visible) {
      setPreviewingId(null);
      setPreviewUrl(null);
    }
  }, [visible]);

  // Toggle preview for a track. Tapping the playing one stops it; tapping a
  // different one switches. Uses the track's previewUrl (falls back to
  // audioUrl) resolved by the backend when listing/fetching tracks.
  const handleTogglePreview = useCallback(
    async (track: MusicTrack) => {
      if (previewingId === track._id) {
        setPreviewingId(null);
        setPreviewUrl(null);
        return;
      }
      // Prefer the list's previewUrl; if absent, fetch full detail for audioUrl.
      let url = track.previewUrl ?? track.audioUrl ?? null;
      if (!url) {
        try {
          const detail = await momentsService.getMusicTrackById(track._id);
          url = detail.previewUrl ?? detail.audioUrl ?? null;
        } catch {
          url = null;
        }
      }
      if (!url) return;
      setPreviewUrl(url);
      setPreviewingId(track._id);
    },
    [previewingId],
  );

  const loadTracks = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const results = await momentsService.searchMusicTracks({ q, sort: 'trending', limit: 20 });
      setTracks(results);
    } catch {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadTracks();
    }
  }, [visible, loadTracks]);

  const handleSearch = useCallback(
    (text: string) => {
      setQuery(text);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => loadTracks(text || undefined), 300);
    },
    [loadTracks],
  );

  const handleSelectTrack = useCallback((track: MusicTrack) => {
    setSelectedTrack(track);
    setStartMs(0);
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedTrack) {
      onSelect({ trackId: selectedTrack._id, startMs });
    } else {
      onSelect(null);
    }
    onClose();
  }, [selectedTrack, startMs, onSelect, onClose]);

  const handleRemove = useCallback(() => {
    onSelect(null);
    onClose();
  }, [onSelect, onClose]);

  const durationSeconds = selectedTrack ? Math.floor(selectedTrack.durationMs / 1000) : 0;
  const startSeconds = Math.floor(startMs / 1000);

  const renderTrack = useCallback(
    ({ item }: { item: MusicTrack }) => {
      const isSelected = selectedTrack?._id === item._id || currentRef?.trackId === item._id;
      const isPreviewing = previewingId === item._id;
      return (
        <Pressable
          style={({ pressed }) => [
            styles.trackItem,
            isSelected && styles.trackItemSelected,
            pressed && styles.trackItemPressed,
          ]}
          onPress={() => handleSelectTrack(item)}
          android_ripple={{ color: koolaColors.primarySoft }}
          accessibilityRole="button"
          accessibilityLabel={`${item.title} bởi ${item.artist}`}
          accessibilityState={{ selected: isSelected }}>
          <Pressable
            style={({ pressed }) => [styles.previewButton, pressed && styles.previewButtonPressed]}
            onPress={() => handleTogglePreview(item)}
            android_ripple={{ color: koolaColors.primarySoft, borderless: true }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={isPreviewing ? `Dừng nghe thử ${item.title}` : `Nghe thử ${item.title}`}>
            <MaterialIcons
              name={isPreviewing ? 'stop-circle' : 'play-circle-outline'}
              size={32}
              color={isPreviewing ? koolaColors.primary : koolaColors.ink}
            />
          </Pressable>
          <View style={styles.trackInfo}>
            <KoolaText variant="label" tone={isSelected ? 'primary' : 'ink'} numberOfLines={1}>
              {item.title}
            </KoolaText>
            <KoolaText variant="caption" tone="muted" numberOfLines={1}>
              {item.artist}
            </KoolaText>
            {getLicenseLabel(item) ? (
              <KoolaText variant="caption" tone="faint" numberOfLines={1}>
                {getLicenseLabel(item)}
              </KoolaText>
            ) : null}
          </View>
          <View style={styles.trackMeta}>
            {isSelected ? <MaterialIcons name="check-circle" size={18} color={koolaColors.primary} /> : null}
            <KoolaText variant="caption" tone="faint">
              {Math.floor(item.durationMs / 60000)}:
              {String(Math.floor((item.durationMs % 60000) / 1000)).padStart(2, '0')}
            </KoolaText>
          </View>
        </Pressable>
      );
    },
    [selectedTrack, currentRef, previewingId, handleSelectTrack, handleTogglePreview],
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container} accessibilityViewIsModal>
        {/* Hidden audio-only player for previews. Mounts only while a preview is
            active; auto-clears previewingId when the track finishes. */}
        {previewUrl && previewingId ? (
          <Video
            source={{ uri: previewUrl }}
            style={styles.hiddenAudio}
            paused={false}
            muted={false}
            repeat={false}
            playInBackground={false}
            onEnd={() => {
              setPreviewingId(null);
              setPreviewUrl(null);
            }}
            onError={() => {
              setPreviewingId(null);
              setPreviewUrl(null);
            }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Đóng"
            android_ripple={{ color: koolaColors.primarySoft, borderless: true }}
            style={({ pressed }) => [styles.headerAction, pressed && styles.headerActionPressed]}>
            <KoolaText tone="primary">Hủy</KoolaText>
          </Pressable>
          <KoolaText variant="label" weight="700">
            Chọn nhạc
          </KoolaText>
          <Pressable
            onPress={handleConfirm}
            accessibilityRole="button"
            accessibilityLabel="Xác nhận chọn nhạc"
            android_ripple={{ color: koolaColors.primarySoft, borderless: true }}
            style={({ pressed }) => [styles.headerAction, styles.headerActionRight, pressed && styles.headerActionPressed]}>
            <KoolaText tone="primary" weight="700">
              Xong
            </KoolaText>
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={handleSearch}
            placeholder="Tìm nhạc..."
            placeholderTextColor={koolaColors.faint}
            underlineColorAndroid="transparent"
            accessibilityLabel="Tìm kiếm nhạc"
          />
        </View>

        {/* Start offset slider (only when track selected) */}
        {selectedTrack && durationSeconds > 0 && (
          <View style={styles.sliderSection}>
            <KoolaText variant="caption" tone="muted">
              Bắt đầu từ: {Math.floor(startSeconds / 60)}:{String(startSeconds % 60).padStart(2, '0')}
            </KoolaText>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={Math.max(0, durationSeconds - 15)}
              step={1}
              value={startSeconds}
              onValueChange={(val) => setStartMs(val * 1000)}
              minimumTrackTintColor={koolaColors.primary}
              maximumTrackTintColor={koolaColors.line}
              thumbTintColor={koolaColors.primary}
              accessibilityLabel="Chọn điểm bắt đầu của nhạc"
            />
          </View>
        )}

        {/* Track list */}
        {loading ? (
          <ActivityIndicator
            size="large"
            color={koolaColors.primary}
            style={styles.loader}
            accessibilityLabel="Đang tải nhạc"
          />
        ) : (
          <FlatList
            data={tracks}
            keyExtractor={(item) => item._id}
            renderItem={renderTrack}
            contentContainerStyle={styles.trackList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <KoolaText tone="muted" align="center">
                  Không tìm thấy nhạc nào.
                </KoolaText>
              </View>
            }
          />
        )}

        {/* Remove button */}
        {currentRef && (
          <View style={styles.removeButton}>
            <KoolaButton
              title="Bỏ nhạc"
              variant="danger"
              onPress={handleRemove}
            />
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: koolaColors.canvas,
  },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: koolaSpacing.lg,
    paddingVertical: koolaSpacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
    backgroundColor: koolaColors.surface,
  },
  headerAction: {
    minWidth: 56,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerActionRight: {
    alignItems: 'flex-end',
  },
  headerActionPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  searchBar: {
    paddingHorizontal: koolaSpacing.lg,
    paddingVertical: koolaSpacing.md,
    backgroundColor: koolaColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  searchInput: {
    minHeight: 44,
    backgroundColor: koolaColors.canvas,
    borderRadius: koolaRadii.pill,
    paddingHorizontal: koolaSpacing.lg,
    paddingVertical: koolaSpacing.sm,
    fontSize: 15,
    color: koolaColors.ink,
    borderWidth: 1,
    borderColor: koolaColors.line,
  },
  sliderSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: koolaColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  slider: {
    width: '100%',
    marginTop: 4,
  },
  trackList: {
    paddingVertical: koolaSpacing.sm,
    paddingBottom: koolaSpacing.xl,
  },
  trackItem: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: koolaSpacing.lg,
    marginBottom: koolaSpacing.sm,
    paddingHorizontal: koolaSpacing.md,
    paddingVertical: koolaSpacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: koolaColors.line,
    borderRadius: koolaRadii.md,
    backgroundColor: koolaColors.surface,
  },
  trackItemSelected: {
    backgroundColor: koolaColors.primarySoft,
    borderColor: koolaColors.primary,
  },
  trackItemPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  trackInfo: {
    flex: 1,
    marginRight: koolaSpacing.sm,
  },
  trackMeta: {
    minWidth: 44,
    alignItems: 'flex-end',
  },
  previewButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: koolaSpacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  // Audio-only preview player — zero footprint, kept off-screen but mounted.
  hiddenAudio: {
    width: 0,
    height: 0,
    position: 'absolute',
  },
  loader: {
    marginTop: 40,
  },
  emptyState: {
    padding: 40,
  },
  removeButton: {
    padding: 16,
  },
});

export default MusicPicker;
