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
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { KoolaText, KoolaButton, koolaColors, koolaRadii } from '../../ui';
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
  const searchTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
      return (
        <TouchableOpacity
          style={[styles.trackItem, isSelected && styles.trackItemSelected]}
          onPress={() => handleSelectTrack(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title} bởi ${item.artist}`}
          accessibilityState={{ selected: isSelected }}>
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
          <KoolaText variant="caption" tone="faint">
            {Math.floor(item.durationMs / 60000)}:
            {String(Math.floor((item.durationMs % 60000) / 1000)).padStart(2, '0')}
          </KoolaText>
        </TouchableOpacity>
      );
    },
    [selectedTrack, currentRef, handleSelectTrack],
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container} accessibilityViewIsModal>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Đóng">
            <KoolaText tone="primary">Hủy</KoolaText>
          </TouchableOpacity>
          <KoolaText variant="label" weight="700">
            Chọn nhạc
          </KoolaText>
          <TouchableOpacity
            onPress={handleConfirm}
            accessibilityRole="button"
            accessibilityLabel="Xác nhận chọn nhạc">
            <KoolaText tone="primary" weight="700">
              Xong
            </KoolaText>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={handleSearch}
            placeholder="Tìm nhạc..."
            placeholderTextColor={koolaColors.faint}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
    backgroundColor: koolaColors.surface,
  },
  searchBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: koolaColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
  },
  searchInput: {
    backgroundColor: koolaColors.canvas,
    borderRadius: koolaRadii.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    paddingBottom: 20,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: koolaColors.line,
    backgroundColor: koolaColors.surface,
  },
  trackItemSelected: {
    backgroundColor: koolaColors.primarySoft,
  },
  trackInfo: {
    flex: 1,
    marginRight: 8,
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
