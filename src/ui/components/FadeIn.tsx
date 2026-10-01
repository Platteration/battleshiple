import React, { useEffect, useState } from 'react';
import { Animated } from 'react-native';
import { useReduceMotion } from '../../motion';
import { useSettings } from '../../settings';
import { makeStyles } from '../theme';

/** How long a screen takes to appear. Short: it marks the change, it does not perform it. */
export const FADE_MS = 180;

/**
 * A screen that arrives fades in; nothing ever fades out. The screen it
 * replaces is gone at once, so a board can never linger, half transparent,
 * over the pass-the-device cover. Keyed by the caller per screen, so it plays
 * once each time a screen is entered. Reduce motion: no fade.
 */
export function FadeIn({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const { settings } = useSettings();
  const still = useReduceMotion(settings.reduceMotion);
  const [opacity] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    if (still) {
      opacity.setValue(1);
      return;
    }
    const run = Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [still, opacity]);
  return <Animated.View style={[styles.fill, { opacity }]}>{children}</Animated.View>;
}

const useStyles = makeStyles(() => ({
  fill: { flex: 1 },
}));
