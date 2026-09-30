import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Quadrant, Splash } from '../../engine';
import { useReduceMotion } from '../../motion';
import { useSettings } from '../../settings';
import { makeStyles } from '../theme';

interface Props {
  /** Pixel size of the playing area (excluding labels). */
  size: number;
  splashes: readonly Splash[];
}

/** The intel's geometry and timing. A future cosmetic draws above this and never changes it. */
export const INTEL = Object.freeze({
  border: 2,
  /** Distance between hatch lines, as a fraction of the quadrant's side. */
  hatchGap: 0.09,
  hatchOpacity: 0.3,
  rippleMs: 1100,
});

/**
 * Splashes whose ripple has already played, by `quadrant:turn`. Module-level,
 * so switching tabs (which remounts the board) or any re-render never plays
 * the same report twice. Bounded: only recent reports can be on screen.
 */
const played: string[] = [];
function firstSight(key: string): boolean {
  if (played.includes(key)) return false;
  played.push(key);
  if (played.length > 16) played.shift();
  return true;
}

const ORIGIN: Record<Quadrant, { x: 0 | 1; y: 0 | 1 }> = {
  NW: { x: 0, y: 0 },
  NE: { x: 1, y: 0 },
  SW: { x: 0, y: 1 },
  SE: { x: 1, y: 1 },
};

/** One expanding ring, played once, then gone. */
function Ripple({ diameter }: { diameter: number }) {
  const styles = useStyles();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: INTEL.rippleMs,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [progress]);
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1.3] });
  const opacity = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] });
  return (
    <Animated.View
      testID="intel-ripple"
      pointerEvents="none"
      style={[
        styles.ripple,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          left: -diameter / 2,
          top: -diameter / 2,
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  );
}

/**
 * The reported sector: hatched and outlined, which is an honest picture of the
 * intel ("something moved somewhere in here"). It stays for as long as the
 * report does, beneath the hulls and shot marks. There is no text tag: any
 * corner of a quadrant can hold a mark, and a label under it was overdrawn
 * (VISUAL_STYLE.md: no decoration over player markers); the banner names the
 * quadrant in words. When motion is allowed, a report seen for the first time
 * also gets one ripple; reduced motion keeps everything but the ripple.
 */
function Sector({ splash, side, animate }: { splash: Splash; side: number; animate: boolean }) {
  const styles = useStyles();
  const key = `${splash.quadrant}:${splash.turn}`;
  // Decided once per mount, so a re-render cannot flip it.
  const [ripple] = useState(() => animate && firstSight(key));
  const { x, y } = ORIGIN[splash.quadrant];
  const gap = Math.max(6, side * INTEL.hatchGap);
  const lines = Math.ceil((side * 2) / gap);
  return (
    <View
      testID={`intel-${splash.quadrant}`}
      pointerEvents="none"
      style={[styles.sector, { left: x * side, top: y * side, width: side, height: side }]}
    >
      <View style={styles.hatchClip}>
        {Array.from({ length: lines }, (_, i) => (
          <View
            key={i}
            testID="intel-hatch"
            style={[
              styles.hatch,
              // Vertical lines through the square's middle row, turned 45°: each crosses it diagonally.
              { left: i * gap - side / 2, top: -side / 2, height: side * 2, transform: [{ rotate: '45deg' }] },
            ]}
          />
        ))}
      </View>
      {ripple && (
        <View style={{ position: 'absolute', left: side / 2, top: side / 2 }}>
          <Ripple diameter={side * 0.8} />
        </View>
      )}
    </View>
  );
}

/** The quadrants where the enemy fleet just moved. Drawn beneath the hulls and marks. */
export function SplashOverlay({ size, splashes }: Props) {
  const { settings } = useSettings();
  const still = useReduceMotion(settings.reduceMotion);
  const styles = useStyles();
  if (splashes.length === 0) return null;
  // One sector per quadrant: the latest report there.
  const latest = new Map<Quadrant, Splash>();
  for (const s of splashes) {
    const prev = latest.get(s.quadrant);
    if (!prev || s.turn > prev.turn) latest.set(s.quadrant, s);
  }
  return (
    <View pointerEvents="none" style={styles.fill}>
      {[...latest.values()].map((s) => (
        <Sector key={s.quadrant} splash={s} side={size / 2} animate={!still} />
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ palette: p }) => ({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sector: {
    position: 'absolute',
    borderWidth: INTEL.border,
    borderColor: p.intel.stroke,
    backgroundColor: p.intel.fill,
  },
  hatchClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  hatch: { position: 'absolute', width: 1.5, backgroundColor: p.intel.stroke, opacity: INTEL.hatchOpacity },
  ripple: { position: 'absolute', borderWidth: 3, borderColor: p.intel.stroke },
}));
