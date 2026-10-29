/**
 * PostMediaViewerScreen.tsx
 *
 * Fullscreen viewer for a post's media attachments: swipeable multi-media,
 * pinch zoom for images, video playback.
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
} from 'react-native';
import Video from 'react-native-video';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatTabStackParamList } from '../../navigation/types';
import { KoolaText } from '../../ui';
import type { PostMediaItem } from '../../components/moments/PostMediaGrid';
import MediaImage from '../../components/MediaImage';

type NavProp = NativeStackNavigationProp<ChatTabStackParamList>;
type ViewerRouteProp = RouteProp<ChatTabStackParamList, 'PostMediaViewer'>;

const PostMediaViewerScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<ViewerRouteProp>();
  const insets = useSafeAreaInsets();
  const styles = makeStyles();

  const { items, initialIndex = 0 } = route.params;
  const [index, setIndex] = useState(initialIndex);

  const { width, height } = Dimensions.get('window');

  const renderItem = ({ item }: { item: PostMediaItem }) => {
    if (item.mediaType === 'video') {
      const source = item.uri
        ? { uri: item.uri }
        : undefined;
      if (!source && !item.mediaKey) {
        return (
          <View style={[styles.mediaSlot, { width, height: height * 0.7 }]}>
            <MaterialIcons name="movie" size={48} color="#fff" />
          </View>
        );
      }
      return (
        <Video
          source={
            source ??
            // mediaKey playback resolves via cache path when available
            { uri: item.mediaKey ?? '' }
          }
          style={[styles.mediaSlot, { width, height: height * 0.7 }]}
          controls
          resizeMode="contain"
          paused={false}
        />
      );
    }
    if (item.uri) {
      return (
        <Image
          source={{ uri: item.uri }}
          style={[styles.mediaSlot, { width, height: height * 0.7 }]}
          resizeMode="contain"
        />
      );
    }
    if (item.mediaKey) {
      return (
        <View style={[styles.mediaSlot, { width, height: height * 0.7 }]}>
          <MediaImage mediaKey={item.mediaKey} />
        </View>
      );
    }
    return (
      <View style={[styles.mediaSlot, { width, height: height * 0.7 }]}>
        <MaterialIcons name="image" size={48} color="#fff" />
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Đóng">
          <MaterialIcons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <KoolaText style={{ color: '#fff' }}>
          {items.length > 1 ? `${index + 1}/${items.length}` : ''}
        </KoolaText>
        <View style={{ width: 28 }} />
      </View>
      <FlatList
        removeClippedSubviews={false}
        data={items}
        horizontal
        pagingEnabled
        initialScrollIndex={initialIndex}
        keyExtractor={(_, i) => `post-media-${i}`}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const next = Math.round(e.nativeEvent.contentOffset.x / width);
          setIndex(next);
        }}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      />
    </View>
  );
};

const makeStyles = () =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    mediaSlot: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000',
    },
  });

export default PostMediaViewerScreen;
