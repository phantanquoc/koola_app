/**
 * HighlightsScreen.tsx
 *
 * Grid of Highlight covers for a user's profile.
 * Own profile: long-press cover -> "Đổi tên" / "Xóa" / "Sắp xếp lại"
 * "Tạo Highlight mới" entry at top.
 * Tap highlight -> opens MomentViewerScreen in highlight mode.
 *
 * Renders coverKey as a thumbnail image when available (via mediaCacheService),
 * falls back to story count badge when no cover.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActionSheetIOS,
  Platform,
  TextInput,
  Modal,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { ChatTabStackParamList } from '../../navigation/types';
import { KoolaText, KoolaButton, koolaRadii, useTheme } from '../../ui';
import type { Palette } from '../../ui/theme';
import { momentsService } from '../../services/moments/momentsService';
import { getOrDownload } from '../../services/media/mediaCacheService';
import type { Highlight } from '../../services/moments/momentsApi';

type NavProp = NativeStackNavigationProp<ChatTabStackParamList>;
type HighlightsRouteProp = RouteProp<ChatTabStackParamList, 'Highlights'>;

const COLUMN_COUNT = 3;

// ─── Cover Thumbnail ────────────────────────────────────────────────────────

interface CoverThumbnailProps {
  coverKey: string | null;
  storyCount: number;
  palette: Palette;
}

const CoverThumbnail: React.FC<CoverThumbnailProps> = ({ coverKey, storyCount, palette }) => {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (!coverKey) return;
    let cancelled = false;
    getOrDownload(coverKey).then((resolved) => {
      if (!cancelled && resolved) setUri(resolved);
    });
    return () => { cancelled = true; };
  }, [coverKey]);

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          borderWidth: 1,
          borderColor: palette.line,
        }}
        resizeMode="cover"
        accessibilityLabel="Ảnh bìa Highlight"
      />
    );
  }

  return (
    <View
      style={{
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: palette.skeleton,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: palette.line,
      }}>
      <KoolaText variant="caption" tone="muted" align="center">
        {storyCount} khoảnh khắc
      </KoolaText>
    </View>
  );
};

// ─── HighlightsScreen ───────────────────────────────────────────────────────

const HighlightsScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<HighlightsRouteProp>();
  const { userId, isOwn } = route.params;
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Highlight | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const loadHighlights = useCallback(async () => {
    setLoading(true);
    const data = await momentsService.loadUserHighlights(userId);
    setHighlights(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadHighlights();
  }, [loadHighlights]);

  const handleLongPress = useCallback(
    (highlight: Highlight) => {
      if (!isOwn) return;

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Đổi tên', 'Xóa', 'Hủy'],
            destructiveButtonIndex: 1,
            cancelButtonIndex: 2,
          },
          (index) => {
            if (index === 0) {
              setRenameTarget(highlight);
              setNewTitle(highlight.title);
              setRenameModalVisible(true);
            } else if (index === 1) {
              handleDeleteHighlight(highlight);
            }
          },
        );
      } else {
        Alert.alert(highlight.title, undefined, [
          { text: 'Đổi tên', onPress: () => {
            setRenameTarget(highlight);
            setNewTitle(highlight.title);
            setRenameModalVisible(true);
          }},
          {
            text: 'Xóa',
            style: 'destructive',
            onPress: () => handleDeleteHighlight(highlight),
          },
          { text: 'Hủy', style: 'cancel' },
        ]);
      }
    },
    [isOwn],
  );

  const handleDeleteHighlight = useCallback(async (highlight: Highlight) => {
    Alert.alert(
      'Xóa Highlight',
      `Xóa "${highlight.title}"? Hành động này không thể hoàn tác.`,
      [
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await momentsService.deleteHighlight(highlight._id);
              setHighlights((prev) => prev.filter((h) => h._id !== highlight._id));
            } catch {
              Alert.alert('Lỗi', 'Không thể xóa Highlight. Vui lòng thử lại.');
            }
          },
        },
        { text: 'Hủy', style: 'cancel' },
      ],
    );
  }, []);

  const handleRename = useCallback(async () => {
    if (!renameTarget || !newTitle.trim()) return;
    try {
      await momentsService.updateHighlight(renameTarget._id, { title: newTitle.trim() });
      setHighlights((prev) =>
        prev.map((h) => (h._id === renameTarget._id ? { ...h, title: newTitle.trim() } : h)),
      );
      setRenameModalVisible(false);
      setRenameTarget(null);
    } catch {
      Alert.alert('Lỗi', 'Không thể đổi tên Highlight.');
    }
  }, [renameTarget, newTitle]);

  const handleTapHighlight = useCallback(
    async (highlight: Highlight) => {
      if (!highlight.storyIds.length) return;
      const firstStoryId = highlight.storyIds[0];
      navigation.push('MomentViewer', { authorId: userId, startStoryId: firstStoryId });
    },
    [navigation, userId],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} accessibilityLabel="Đang tải mục nổi bật" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={highlights}
        keyExtractor={(item) => item._id}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={styles.grid}
        ListHeaderComponent={
          isOwn ? (
            <TouchableOpacity
              style={styles.newHighlightEntry}
              onPress={() =>
                Alert.alert(
                  'Tạo Highlight mới',
                  'Chức năng tạo Highlight từ kho khoảnh khắc đã hết hạn.',
                  [{ text: 'OK' }],
                )
              }
              accessibilityRole="button"
              accessibilityLabel="Tạo Highlight mới">
              <View style={styles.newHighlightIcon}>
                <KoolaText style={styles.plusSign}>+</KoolaText>
              </View>
              <KoolaText variant="caption" tone="ink" align="center" style={styles.newHighlightLabel}>
                Tạo mới
              </KoolaText>
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.highlightCell}
            onPress={() => handleTapHighlight(item)}
            onLongPress={() => handleLongPress(item)}
            accessibilityRole="button"
            accessibilityLabel={`Highlight: ${item.title}`}
            accessibilityHint={isOwn ? 'Nhấn giữ để chỉnh sửa hoặc xóa' : undefined}>
            <CoverThumbnail
              coverKey={item.coverKey}
              storyCount={item.storyIds.length}
              palette={palette}
            />
            <KoolaText
              variant="caption"
              tone="ink"
              align="center"
              numberOfLines={1}
              style={styles.highlightTitle}>
              {item.title}
            </KoolaText>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <KoolaText tone="muted" align="center">
              {isOwn ? 'Bạn chưa có Highlight nào.' : 'Người dùng này chưa có Highlight nào.'}
            </KoolaText>
          </View>
        }
      />

      {/* Rename modal */}
      <Modal
        visible={renameModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setRenameModalVisible(false)}>
        <View style={styles.modalBackdrop} accessibilityViewIsModal>
          <View style={styles.renameModal}>
            <KoolaText variant="label" weight="700" style={styles.renameTitle}>
              Đổi tên Highlight
            </KoolaText>
            <TextInput
              style={styles.renameInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Tên Highlight..."
              placeholderTextColor={palette.faint}
              maxLength={50}
              autoFocus
              accessibilityLabel="Tên Highlight mới"
            />
            <View style={styles.renameActions}>
              <KoolaButton
                title="Hủy"
                variant="secondary"
                onPress={() => setRenameModalVisible(false)}
                style={[styles.renameBtn, styles.renameBtnFirst]}
              />
              <KoolaButton
                title="Lưu"
                onPress={handleRename}
                style={styles.renameBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const CELL_SIZE = '33.33%';

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.canvas,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    grid: {
      padding: 4,
    },
    newHighlightEntry: {
      width: CELL_SIZE,
      alignItems: 'center',
      padding: 8,
      marginBottom: 8,
    } as unknown as object,
    newHighlightIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 2,
      borderColor: palette.line,
      alignItems: 'center',
      justifyContent: 'center',
      borderStyle: 'dashed',
    },
    plusSign: {
      fontSize: 28,
      color: palette.muted,
    },
    newHighlightLabel: {
      marginTop: 4,
    },
    highlightCell: {
      width: CELL_SIZE,
      alignItems: 'center',
      padding: 8,
      marginBottom: 8,
    } as unknown as object,
    highlightTitle: {
      marginTop: 4,
      maxWidth: 80,
    },
    empty: {
      padding: 40,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    renameModal: {
      backgroundColor: palette.surface,
      borderRadius: koolaRadii.md,
      padding: 24,
      width: 300,
    },
    renameTitle: {
      textAlign: 'center',
    },
    renameInput: {
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: koolaRadii.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 15,
      color: palette.ink,
      marginVertical: 16,
    },
    renameActions: {
      flexDirection: 'row',
    },
    renameBtn: {
      flex: 1,
    },
    renameBtnFirst: {
      marginRight: 12,
    },
  });

export default HighlightsScreen;
