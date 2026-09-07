import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Quadrant } from '../../engine';
import { colors } from '../theme';

interface Props {
  /** Pixel size of the 10x10 playing area (excluding labels). */
  size: number;
  quadrants: Quadrant[];
}

function centerOf(q: Quadrant, size: number): { x: number; y: number } {
  const quarter = size / 4;
  const x = q === 'NE' || q === 'SE' ? size - quarter : quarter;
  const y = q === 'SW' || q === 'SE' ? size - quarter : quarter;
  return { x, y };
}

function Ripple({ x, y, diameter, delay }: { x: number; y: number; diameter: number; delay: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, delay]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] });
  const opacity = progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ripple,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          left: x - diameter / 2,
          top: y - diameter / 2,
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  );
}

/** Animated ripples marking the quadrant(s) where the enemy fleet just moved. */
export function SplashOverlay({ size, quadrants }: Props) {
  if (quadrants.length === 0) return null;
  const unique = Array.from(new Set(quadrants));
  const diameter = size / 2.4;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill]}>
      {unique.map((q) => {
        const { x, y } = centerOf(q, size);
        return (
          <React.Fragment key={q}>
            <Ripple x={x} y={y} diameter={diameter} delay={0} />
            <Ripple x={x} y={y} diameter={diameter} delay={550} />
            <Ripple x={x} y={y} diameter={diameter * 0.35} delay={250} />
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  ripple: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: colors.splash,
    backgroundColor: 'rgba(155, 224, 255, 0.12)',
  },
});
