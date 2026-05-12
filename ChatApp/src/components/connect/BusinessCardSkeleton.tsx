import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';

/**
 * Skeleton placeholder for BusinessCard while list is loading.
 * Matches the redesigned card layout (logo 56, 1-line tagline, 2 buttons).
 */
const BusinessCardSkeleton: React.FC = () => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.5, 0.9, 0.5],
  });

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Animated.View style={[styles.logo, { opacity }]} />
        <View style={styles.nameCol}>
          <Animated.View style={[styles.lineName, { opacity }]} />
          <Animated.View style={[styles.lineBadge, { opacity }]} />
        </View>
      </View>
      <Animated.View style={[styles.lineTagline, { opacity }]} />
      <Animated.View style={[styles.lineConnections, { opacity }]} />
      <View style={styles.buttonsRow}>
        <Animated.View style={[styles.btnLeft, { opacity }]} />
        <Animated.View style={[styles.btnRight, { opacity }]} />
      </View>
    </View>
  );
};

const SKELETON_COLOR = '#E5E7EB';

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: SKELETON_COLOR,
  },
  nameCol: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
    gap: 8,
  },
  lineName: {
    height: 16,
    width: '70%',
    borderRadius: 4,
    backgroundColor: SKELETON_COLOR,
  },
  lineBadge: {
    height: 12,
    width: '50%',
    borderRadius: 4,
    backgroundColor: SKELETON_COLOR,
  },
  lineTagline: {
    height: 12,
    width: '90%',
    borderRadius: 4,
    marginTop: 14,
    backgroundColor: SKELETON_COLOR,
  },
  lineConnections: {
    height: 12,
    width: '40%',
    borderRadius: 4,
    marginTop: 12,
    backgroundColor: SKELETON_COLOR,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  btnLeft: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: SKELETON_COLOR,
  },
  btnRight: {
    flex: 2,
    height: 44,
    borderRadius: 8,
    backgroundColor: SKELETON_COLOR,
  },
});

export default BusinessCardSkeleton;
