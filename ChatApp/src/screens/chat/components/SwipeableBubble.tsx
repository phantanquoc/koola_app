import React, { useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import type { IMessage } from 'react-native-gifted-chat';

const SWIPE_THRESHOLD = 60;

interface Props {
  message: IMessage & Record<string, unknown>;
  isOwn: boolean;
  onReply: (message: IMessage & Record<string, unknown>) => void;
  children: React.ReactNode;
}

/**
 * Task 4.7: Wraps a GiftedChat Bubble in a horizontal pan gesture.
 * WhatsApp convention:
 *   - Own messages (right-aligned): swipe right-to-left (negative dx) to reply
 *   - Other's messages (left-aligned): swipe left-to-right (positive dx) to reply
 * Threshold: 60px. Animates content translate + arrow icon fade-in.
 */
const SwipeableBubble: React.FC<Props> = ({ message, isOwn, onReply, children }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const arrowOpacity = useRef(new Animated.Value(0)).current;
  const triggered = useRef(false);

  const panGesture = Gesture.Pan()
    .activeOffsetX(isOwn ? [-10, 999] : [-999, 10])
    .onUpdate((e) => {
      const dx = e.translationX;
      // Own: allow negative (RTL), Other: allow positive (LTR)
      const clamped = isOwn
        ? Math.max(-SWIPE_THRESHOLD * 1.2, Math.min(0, dx))
        : Math.max(0, Math.min(SWIPE_THRESHOLD * 1.2, dx));
      translateX.setValue(clamped);
      const progress = Math.abs(clamped) / SWIPE_THRESHOLD;
      arrowOpacity.setValue(Math.min(1, progress));

      if (!triggered.current && Math.abs(clamped) >= SWIPE_THRESHOLD) {
        triggered.current = true;
      }
    })
    .onEnd(() => {
      if (triggered.current) {
        onReply(message);
      }
      triggered.current = false;
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
        Animated.timing(arrowOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
    })
    .runOnJS(true);

  const arrowName = isOwn ? 'reply' : 'reply';

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.wrapper}>
        {/* Arrow icon shown on the opposite side of swipe direction */}
        {isOwn ? (
          <Animated.View style={[styles.arrowLeft, { opacity: arrowOpacity }]}>
            <MaterialIcons name={arrowName} size={20} color="#2196F3" />
          </Animated.View>
        ) : (
          <Animated.View style={[styles.arrowRight, { opacity: arrowOpacity }]}>
            <MaterialIcons name={arrowName} size={20} color="#2196F3" style={styles.arrowFlipped} />
          </Animated.View>
        )}
        <Animated.View style={{ transform: [{ translateX }] }}>
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowLeft: {
    position: 'absolute',
    left: -28,
    zIndex: 1,
  },
  arrowRight: {
    position: 'absolute',
    right: -28,
    zIndex: 1,
  },
  arrowFlipped: {
    transform: [{ scaleX: -1 }],
  },
});

export default SwipeableBubble;
