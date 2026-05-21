import React, { useState, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  StatusBar,
  Dimensions,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
  ToastAndroid,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import PagerView from 'react-native-pager-view';

// Lazy import — avoid crash if native module not yet linked
const getBlobUtil = () => require('react-native-blob-util').default;

const { width: SW, height: SH } = Dimensions.get('window');

const SPRING_CONFIG = { damping: 15, stiffness: 180, mass: 0.5 };
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

// Clamp pan translate so scaled image edges stay within screen bounds.
function clampTranslation(tx: number, ty: number, scaleValue: number) {
  'worklet';
  const maxX = Math.max(0, (SW * scaleValue - SW) / 2);
  const maxY = Math.max(0, (SH * scaleValue - SH) / 2);
  return {
    x: Math.min(Math.max(tx, -maxX), maxX),
    y: Math.min(Math.max(ty, -maxY), maxY),
  };
}

// ─── Single zoomable image page ─────────────────────────────────────────────
const ZoomableImage: React.FC<{ uri: string }> = ({ uri }) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const [isZoomed, setIsZoomed] = useState(false);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((event) => {
          const next = savedScale.value * event.scale;
          scale.value = Math.min(Math.max(next, 1), MAX_SCALE);
          const clamped = clampTranslation(translateX.value, translateY.value, scale.value);
          translateX.value = clamped.x;
          translateY.value = clamped.y;
        })
        .onEnd(() => {
          if (scale.value < 1) {
            scale.value = withSpring(1, SPRING_CONFIG);
            translateX.value = withSpring(0, SPRING_CONFIG);
            translateY.value = withSpring(0, SPRING_CONFIG);
            savedScale.value = 1;
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
          } else {
            savedScale.value = scale.value;
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
          }
        })
        .onFinalize(() => {
          runOnJS(setIsZoomed)(scale.value > 1);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(1)
        .maxPointers(1)
        .minDistance(10)
        .enabled(isZoomed)
        .onUpdate((event) => {
          const nextX = savedTranslateX.value + event.translationX;
          const nextY = savedTranslateY.value + event.translationY;
          const clamped = clampTranslation(nextX, nextY, scale.value);
          translateX.value = clamped.x;
          translateY.value = clamped.y;
        })
        .onEnd(() => {
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isZoomed],
  );

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
          if (scale.value > 1) {
            scale.value = withSpring(1, SPRING_CONFIG);
            translateX.value = withSpring(0, SPRING_CONFIG);
            translateY.value = withSpring(0, SPRING_CONFIG);
            savedScale.value = 1;
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
            runOnJS(setIsZoomed)(false);
          } else {
            scale.value = withSpring(DOUBLE_TAP_SCALE, SPRING_CONFIG);
            savedScale.value = DOUBLE_TAP_SCALE;
            runOnJS(setIsZoomed)(true);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const composed = useMemo(
    () => Gesture.Simultaneous(doubleTapGesture, pinchGesture, panGesture),
    [doubleTapGesture, pinchGesture, panGesture],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={s.imgWrap} collapsable={false}>
        <Animated.Image
          source={{ uri }}
          style={[s.img, animatedStyle]}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
};

// ─── Main screen ────────────────────────────────────────────────────────────
const ImageViewerScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'ImageViewer'>>();
  const { imageUrl, imageUrls, initialIndex } = route.params;

  // Build gallery list — fallback to single image for backward compat
  const images = useMemo(() => imageUrls && imageUrls.length > 0 ? imageUrls : [imageUrl], [imageUrls, imageUrl]);
  const startIndex = initialIndex ?? 0;

  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [downloading, setDownloading] = useState(false);

  const currentImageUrl = images[currentIndex] || imageUrl;

  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle('light-content');
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor('#000');
        StatusBar.setTranslucent(false);
      }
      return () => {
        StatusBar.setBarStyle('dark-content');
        if (Platform.OS === 'android') {
          StatusBar.setBackgroundColor('#ffffff');
          StatusBar.setTranslucent(false);
        }
      };
    }, []),
  );

  const requestStoragePermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    if (Platform.Version >= 29) return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      {
        title: 'Quyền lưu ảnh',
        message: 'Cho phép ứng dụng lưu ảnh vào thư viện',
        buttonPositive: 'Cho phép',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const handleDownload = async () => {
    try {
      const hasPermission = await requestStoragePermission();
      if (!hasPermission) {
        Alert.alert('Lỗi', 'Không có quyền lưu ảnh');
        return;
      }

      setDownloading(true);
      const ext = currentImageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
      const fileName = `koola_${Date.now()}.${ext}`;

      const BlobUtil = getBlobUtil();
      const { dirs } = BlobUtil.fs;
      const downloadDir = Platform.OS === 'android' ? dirs.PictureDir : dirs.DocumentDir;
      const filePath = `${downloadDir}/${fileName}`;

      const res = await BlobUtil.config({ path: filePath, fileCache: true }).fetch('GET', currentImageUrl);
      const savedPath = res.path();

      if (Platform.OS === 'android') {
        await BlobUtil.MediaCollection.copyToMediaStore(
          { name: fileName, parentFolder: 'Koola', mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}` },
          'Image',
          savedPath,
        );
        BlobUtil.fs.unlink(savedPath).catch(() => {});
        ToastAndroid.show('Đã lưu ảnh vào thư viện', ToastAndroid.SHORT);
      } else {
        Alert.alert('Thành công', 'Đã lưu ảnh');
      }
    } catch (err) {
      console.warn('[ImageViewer] Download error:', err);
      Alert.alert('Lỗi', 'Không thể tải ảnh');
    } finally {
      setDownloading(false);
    }
  };

  const handlePageSelected = useCallback((e: { nativeEvent: { position: number } }) => {
    setCurrentIndex(e.nativeEvent.position);
  }, []);

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.btn}>
          <Text style={s.btnTxt}>✕</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          {images.length > 1 && (
            <Text style={s.counter}>{currentIndex + 1} / {images.length}</Text>
          )}
        </View>
        <TouchableOpacity onPress={handleDownload} style={s.btn} disabled={downloading}>
          {downloading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={s.btnTxt}>⬇</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Swipeable gallery */}
      {images.length > 1 ? (
        <PagerView
          style={s.pager}
          initialPage={startIndex}
          onPageSelected={handlePageSelected}
          overdrag
        >
          {images.map((uri, idx) => (
            <View key={`${uri}-${idx}`} style={s.page}>
              <ZoomableImage uri={uri} />
            </View>
          ))}
        </PagerView>
      ) : (
        <ZoomableImage uri={currentImageUrl} />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: (StatusBar.currentHeight || 44) + 8,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  counter: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontSize: 20, fontWeight: '600' },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imgWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  img: {
    width: SW,
    height: SH,
  },
});

export default ImageViewerScreen;
