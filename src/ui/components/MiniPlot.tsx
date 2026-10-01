import React from 'react';
import { Pressable, View } from 'react-native';
import { Splash } from '../../engine';
import { Grid, HullView } from '../boardView';
import { makeStyles, useTheme } from '../theme';

interface Props {
  grid: Grid;
  hulls: readonly HullView[];
  splashes?: readonly Splash[];
  /** Side of the whole plot, in pt. */
  size: number;
  /** What pressing it does, for a screen reader: "Show your fleet". Without onPress, what it shows. */
  label: string;
  /** Without one it is a picture, not a button. */
  onPress?: () => void;
}

const QUADRANT_ORIGIN = { NW: [0, 0], NE: [1, 0], SW: [0, 1], SE: [1, 1] } as const;

/**
 * The other board, small: water, quadrants, hulls and marks, and nothing to
 * read. One Pressable for the whole plot, never one per cell, so a cell label
 * such as "E5" stays unique on the screen.
 */
export function MiniPlot({ grid, hulls, splashes = [], size, label, onPress }: Props) {
  const styles = useStyles();
  const { palette: p } = useTheme();
  const n = grid.length;
  const cs = size / n;
  const dot = Math.max(2, cs * 0.45);
  const picture = (
    <View testID="mini-plot" pointerEvents="none" style={styles.fill}>
      {splashes.map((s) => {
        const [x, y] = QUADRANT_ORIGIN[s.quadrant];
        return (
          <View
            key={`${s.quadrant}:${s.turn}`}
            style={[styles.intel, { left: (x * size) / 2, top: (y * size) / 2, width: size / 2, height: size / 2 }]}
          />
        );
      })}
      <View style={[styles.divider, { left: size / 2 - 0.5, top: 0, bottom: 0, width: 1 }]} />
      <View style={[styles.divider, { top: size / 2 - 0.5, left: 0, right: 0, height: 1 }]} />
      {hulls.map((h) => (
        <View
          key={h.id}
          style={[
            styles.hull,
            {
              left: h.c * cs + 0.5,
              top: h.r * cs + 0.5,
              width: (h.horizontal ? h.length : 1) * cs - 1,
              height: (h.horizontal ? 1 : h.length) * cs - 1,
              backgroundColor: h.sunk ? p.token.sunk : p.token.fill[h.classId],
            },
          ]}
        />
      ))}
      {grid.flatMap((row, r) =>
        row.map((cell, c) => {
          const hit = cell.ship?.hit || cell.shot?.result === 'hit';
          const miss = !cell.ship && cell.shot?.result === 'miss';
          if (!hit && !miss) return null;
          return (
            <View
              key={`${r},${c}`}
              style={[
                styles.mark,
                {
                  left: c * cs + (cs - dot) / 2,
                  top: r * cs + (cs - dot) / 2,
                  width: dot,
                  height: dot,
                  borderRadius: dot / 2,
                  backgroundColor: hit ? p.pencil.hit : p.pencil.miss,
                },
              ]}
            />
          );
        }),
      )}
    </View>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={label} style={[styles.plot, { width: size, height: size }]}>
        {picture}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.plot, { width: size, height: size }, pressed && styles.pressed]}
    >
      {picture}
    </Pressable>
  );
}

const useStyles = makeStyles(({ palette: p }) => ({
  plot: { backgroundColor: p.board.water, borderWidth: 1, borderColor: p.board.grid, borderRadius: 4, overflow: 'hidden' },
  pressed: { opacity: 0.75 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  intel: { position: 'absolute', borderWidth: 1, borderColor: p.intel.stroke, backgroundColor: p.intel.fill },
  divider: { position: 'absolute', backgroundColor: p.board.sectorLine },
  hull: { position: 'absolute', borderRadius: 2, borderWidth: 0.5, borderColor: p.token.stroke },
  mark: { position: 'absolute' },
}));
