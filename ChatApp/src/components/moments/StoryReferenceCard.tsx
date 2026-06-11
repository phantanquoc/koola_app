/**
 * StoryReferenceCard.tsx
 *
 * Chat bubble prepend card shown when message has `metadata.storyReply`.
 * Shows thumbnail, caption snippet, and a "Khoảnh khắc" label.
 * Tap → navigate to story viewer (or show expired overlay if 410/404).
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatTabStackParamList } from '../../navigation/types';
import { KoolaText, koolaColors, koolaRadii } from '../../ui';
import { storiesApi } from '../../services/moments/momentsApi';
import MediaImage from '../MediaImage';

type NavProp = NativeStackNavigationProp<ChatTabStackParamList>;

interface StoryReplyMetadata {
  storyId: string;
  mediaKeyPreview?: string;
  captionSnippet?: string;
  authorId?: string;
}

interface Props {
  storyReply: StoryReplyMetadata;
}

type CardState = 'normal' | 'expired';

const StoryReferenceCard: React.FC<Props> = ({ storyReply }) => {
  const navigation = useNavigation<NavProp>();
  const [cardState, setCardState] = useState<CardState>('normal');

  const handlePress = useCallback(async () => {
    if (cardState === 'expired') return;

    try {
      // Validate story is still accessible
      const story = await storiesApi.getStoryById(storyReply.storyId);
      navigation.push('MomentViewer', {
        authorId: story.authorId,
        startStoryId: storyReply.storyId,
      });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 410 || status === 404) {
        setCardState('expired');
      } else {
        // Unknown error — try navigate anyway
        if (storyReply.authorId) {
          navigation.push('MomentViewer', {
            authorId: storyReply.authorId,
            startStoryId: storyReply.storyId,
          });
        }
      }
    }
  }, [cardState, storyReply, navigation]);

  if (cardState === 'expired') {
    return (
      <View
        style={[styles.card, styles.expiredCard]}
        accessibilityLabel="Khoảnh khắc không còn khả dụng">
        <View style={styles.expiredOverlay}>
          <KoolaText variant="caption" tone="muted" align="center">
            Khoảnh khắc không còn khả dụng
          </KoolaText>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Khoảnh khắc${storyReply.captionSnippet ? `: ${storyReply.captionSnippet}` : ''}`}
      accessibilityHint="Nhấn để xem khoảnh khắc">
      {/* Thumbnail */}
      <View style={styles.thumbnailContainer}>
        {storyReply.mediaKeyPreview ? (
          <View style={styles.thumbnail}>
            <MediaImage
              mediaKey={storyReply.mediaKeyPreview}
              imageWidth={56}
              imageHeight={56}
            />
          </View>
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <KoolaText tone="faint" style={styles.thumbnailIcon}>
              ✦
            </KoolaText>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.labelRow}>
          <KoolaText variant="caption" tone="primary" weight="600">
            Khoảnh khắc
          </KoolaText>
        </View>
        {storyReply.captionSnippet ? (
          <KoolaText variant="caption" tone="muted" numberOfLines={2}>
            {storyReply.captionSnippet}
          </KoolaText>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: koolaColors.canvas,
    borderRadius: koolaRadii.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: koolaColors.line,
    marginBottom: 4,
    minHeight: 56,
  },
  expiredCard: {
    opacity: 0.6,
  },
  expiredOverlay: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailContainer: {
    width: 56,
    height: 56,
    flexShrink: 0,
  },
  thumbnail: {
    width: 56,
    height: 56,
  },
  thumbnailPlaceholder: {
    backgroundColor: koolaColors.skeleton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailIcon: {
    fontSize: 20,
  },
  info: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});

export default StoryReferenceCard;
