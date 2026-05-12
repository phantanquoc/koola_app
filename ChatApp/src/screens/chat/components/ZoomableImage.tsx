import React, { forwardRef, useImperativeHandle, useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { useWindowDimensions, View, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const SPRING_CONFIG = { damping: 15, stiffness: 180, mass: 0.5 };
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

// Clamp pan translate so scaled image edges stay within screen bounds.
// Runs on UI thread — must be marked as worklet.
// Dimensions are passed as params (not captured from module closure) because
// Reanimated worklets do not reliably serialize module-level bindings.
function clampTranslation(
  tx: number,
  ty: number,
  scaleValue: number,
  screenW: number,
  screenH: number,
) {
  'worklet';
  const maxX = Math.max(0, (screenW * scaleValue - screenW) / 2);
  const maxY = Math.max(0, (screenH * scaleValue - screenH) / 2);
  return {
    x: Math.min(Math.max(tx, -maxX), maxX),
    y: Math.min(Math.max(ty, -maxY), maxY),
  };
}

interface Props {
  uri: string | null;
  onScaleChange: (scale: number) => void;
}

export type ZoomableImageHandle = {
  reset: () => void;
};

const ZoomableImage = forwardRef<ZoomableImageHandle, Props>(
  ({ uri, onScaleChange }, ref) => {
    const { width: windowW, height: windowH } = useWindowDimensions();

    // --- Shared values for transform ---
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

    // Mirror dimensions into shared values so worklets can read current size
    // without capturing a stale closure reference. Updated when the screen
    // rotates / resizes.
    const screenW = useSharedValue(windowW);
    const screenH = useSharedValue(windowH);
    useEffect(() => {
      screenW.value = windowW;
      screenH.value = windowH;
    }, [windowW, windowH, screenW, screenH]);

    // Keep a ref to the latest onScaleChange so gesture callbacks (memoized with
    // empty deps) always call the current version without needing to re-create.
    const onScaleChangeRef = useRef(onScaleChange);
    useEffect(() => {
      onScaleChangeRef.current = onScaleChange;
    }, [onScaleChange]);

    // panEnabled drives whether the Pan gesture is active.
    // Starts false (scale=1) so PagerView can claim horizontal swipes.
    const [panEnabled, setPanEnabled] = useState(false);

    // Stable notifier — created once, reads from ref at call time.
    const notifyScale = useCallback((s: number) => {
      onScaleChangeRef.current(s);
      setPanEnabled(s > 1.01);
    }, []);

    useImperativeHandle(ref, () => ({
      reset() {
        scale.value = 1;
        savedScale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        onScaleChangeRef.current(1);
      },
    }));

    // Pinch gesture: scale with clamp [1, MAX_SCALE]
    const pinchGesture = useMemo(
      () =>
        Gesture.Pinch()
          .onUpdate((event) => {
            const next = savedScale.value * event.scale;
            scale.value = Math.min(Math.max(next, 1), MAX_SCALE);
            const clamped = clampTranslation(translateX.value, translateY.value, scale.value, screenW.value, screenH.value);
            translateX.value = clamped.x;
            translateY.value = clamped.y;
            runOnJS(notifyScale)(scale.value);
          })
          .onEnd(() => {
            if (scale.value < 1) {
              scale.value = withSpring(1, SPRING_CONFIG);
              translateX.value = withSpring(0, SPRING_CONFIG);
              translateY.value = withSpring(0, SPRING_CONFIG);
              savedScale.value = 1;
              savedTranslateX.value = 0;
              savedTranslateY.value = 0;
              runOnJS(notifyScale)(1);
            } else {
              savedScale.value = scale.value;
              savedTranslateX.value = translateX.value;
              savedTranslateY.value = translateY.value;
            }
          }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    // Pan gesture: only meaningful when zoomed in
    const panGesture = useMemo(
      () =>
        Gesture.Pan()
          .enabled(panEnabled)
          .minPointers(1)
          .maxPointers(1)
          .minDistance(0)
          .activeOffsetX([-2, 2])
          .activeOffsetY([-2, 2])
          .onUpdate((event) => {
            // Only pan when zoomed — when scale=1 keep translate at 0
            if (savedScale.value <= 1) return;
            const nextX = savedTranslateX.value + event.translationX;
            const nextY = savedTranslateY.value + event.translationY;
            const clamped = clampTranslation(nextX, nextY, scale.value, screenW.value, screenH.value);
            translateX.value = clamped.x;
            translateY.value = clamped.y;
          })
          .onEnd(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
          }),
      [panEnabled],
    );

    // Double-tap: toggle between 1x and DOUBLE_TAP_SCALE
    const doubleTapGesture = useMemo(
      () =>
        Gesture.Tap()
          .numberOfTaps(2)
          .onEnd(() => {
            if (scale.value > 1) {
              // Reset to 1x
              scale.value = withSpring(1, SPRING_CONFIG);
              translateX.value = withSpring(0, SPRING_CONFIG);
              translateY.value = withSpring(0, SPRING_CONFIG);
              savedScale.value = 1;
              savedTranslateX.value = 0;
              savedTranslateY.value = 0;
              runOnJS(notifyScale)(1);
            } else {
              // Zoom to DOUBLE_TAP_SCALE
              scale.value = withSpring(DOUBLE_TAP_SCALE, SPRING_CONFIG);
              savedScale.value = DOUBLE_TAP_SCALE;
              runOnJS(notifyScale)(DOUBLE_TAP_SCALE);
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

    if (uri === null) {
      return (
        <View style={s.center}>
          <ActivityIndicator color="#fff" />
        </View>
      );
    }

    return (
      <GestureDetector gesture={composed}>
        <Animated.View style={s.imgWrap} collapsable={false}>
          <Animated.Image
            source={{ uri }}
            style={[{ width: windowW, height: windowH }, animatedStyle]}
            resizeMode="contain"
          />
        </Animated.View>
      </GestureDetector>
    );
  },
);

ZoomableImage.displayName = 'ZoomableImage';

const s = StyleSheet.create({
  imgWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

export default ZoomableImage;
