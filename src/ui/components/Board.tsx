import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BOARD_SIZE, Coord, Quadrant, headingArrow } from '../../engine';
import { CellView, Grid } from '../boardView';
import { makeStyles, useTheme } from '../theme';
import { SplashOverlay } from './SplashOverlay';

interface Props {
  grid: Grid;
  /** Total pixel width available for the board including labels. */
  width: number;
  onPressCell?: (coord: Coord) => void;
  splashes?: Quadrant[];
  disabled?: boolean;
}

const COLS = 'ABCDEFGHIJ';

function ageOpacity(age: number): number {
  return Math.max(0.35, 1 - age * 0.07);
}

function CellContent({ cell, size }: { cell: CellView; size: number }) {
  const styles = useStyles();
  const { palette: p } = useTheme();
  const fontSize = Math.max(10, size * 0.55);
  const nodes: React.ReactNode[] = [];

  if (cell.ship) {
    const s = cell.ship;
    nodes.push(
      // The crisp outline plate. When selected it takes the selection colour, so
      // the ring reads as a frame against the water (>=3:1 in both palettes);
      // on the hull alone it was ~1.1:1 against the patrol boat's orange.
      <View
        key="outline"
        style={[StyleSheet.absoluteFill, { backgroundColor: s.selected ? p.selected : p.token.stroke, borderRadius: 5 }]}
      />,
      <View
        key="ship"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: s.sunk ? p.token.sunk : p.token.fill[s.classId],
            opacity: s.sunk ? 0.9 : s.ready ? 1 : 0.6,
            margin: 1,
            borderRadius: 4,
            // Shallow tabletop depth (VISUAL_STYLE.md): a small upper-left
            // highlight and one short lower edge. The crisp outline is the
            // plate drawn behind this view.
            borderWidth: 1,
            borderTopColor: p.depth.highlight,
            borderLeftColor: p.depth.highlightSoft,
            borderRightColor: p.depth.shade,
            borderBottomColor: p.depth.edge,
            borderBottomWidth: 3,
          },
          s.selected && styles.selectedShip,
        ]}
      />,
    );
    if (s.isBow && !s.sunk) {
      nodes.push(
        <Text key="bow" style={[styles.bow, { color: p.token.mark[s.classId], fontSize: fontSize * 0.8 }]}>
          {headingArrow(s.heading)}
        </Text>,
      );
    }
    if (s.hit) {
      // A halo under the mark: the hit colour alone is 1.05-2.3:1 on the hull
      // fills. A drawn disc rather than a text shadow, which some platforms drop.
      nodes.push(
        <View
          key="hitHalo"
          style={[
            styles.hitHalo,
            { width: size * 0.62, height: size * 0.62, borderRadius: size * 0.31, backgroundColor: p.pencil.hitHalo },
          ]}
        />,
        <Text key="hit" style={[styles.hitMark, { fontSize }]}>
          ✕
        </Text>,
      );
    }
  }

  if (cell.shot && !cell.ship) {
    const o = ageOpacity(cell.shot.age);
    if (cell.shot.result === 'miss') {
      nodes.push(
        <View
          key="miss"
          style={[styles.missDot, { width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15, opacity: o }]}
        />,
      );
    } else {
      nodes.push(
        <Text key="staleHit" style={[styles.hitMark, { fontSize, opacity: o }]}>
          ✕
        </Text>,
      );
    }
  }

  if (cell.preview) {
    const ok = cell.preview === 'ok';
    nodes.push(
      <View
        key="preview"
        style={[
          StyleSheet.absoluteFill,
          styles.preview,
          {
            backgroundColor: ok ? p.preview.okFill : p.preview.badFill,
            borderColor: ok ? p.preview.okStroke : p.preview.badStroke,
          },
        ]}
      />,
    );
  }

  if (cell.target) {
    nodes.push(
      <View key="target" style={[StyleSheet.absoluteFill, styles.target]}>
        <Text style={[styles.targetMark, { fontSize: fontSize * 1.1 }]}>+</Text>
      </View>,
    );
  }

  return <>{nodes}</>;
}

export function Board({ grid, width, onPressCell, splashes = [], disabled }: Props) {
  const styles = useStyles();
  const cell = Math.floor(width / (BOARD_SIZE + 1));
  const playSize = cell * BOARD_SIZE;
  const labelFont = Math.max(9, cell * 0.4);

  return (
    <View style={[styles.wrapper, { width: cell * (BOARD_SIZE + 1) }]}>
      <View style={styles.row}>
        <View style={{ width: cell, height: cell }} />
        {Array.from({ length: BOARD_SIZE }, (_, c) => (
          <View key={c} style={[styles.label, { width: cell, height: cell }]}>
            <Text style={[styles.labelText, { fontSize: labelFont }]}>{COLS[c]}</Text>
          </View>
        ))}
      </View>
      {grid.map((row, r) => (
        <View key={r} style={styles.row}>
          <View style={[styles.label, { width: cell, height: cell }]}>
            <Text style={[styles.labelText, { fontSize: labelFont }]}>{r + 1}</Text>
          </View>
          {row.map((cv, c) => (
            <Pressable
              key={c}
              accessibilityLabel={`${COLS[c]}${r + 1}`}
              disabled={disabled || !onPressCell}
              onPress={() => onPressCell?.({ r, c })}
              style={[styles.cell, { width: cell, height: cell }]}
            >
              <CellContent cell={cv} size={cell} />
            </Pressable>
          ))}
        </View>
      ))}
      <View pointerEvents="none" style={{ position: 'absolute', left: cell, top: cell, width: playSize, height: playSize }}>
        <SplashOverlay size={playSize} quadrants={splashes} />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  wrapper: { alignSelf: 'center' },
  row: { flexDirection: 'row' },
  label: { alignItems: 'center', justifyContent: 'center' },
  labelText: { ...ty.coord, color: p.board.label },
  cell: {
    backgroundColor: p.board.water,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: p.board.grid,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Per-side colours resolve ahead of `borderColor`, so the ring must name
  // every side or the hull's bevel (set per side above) wins and no ring shows.
  selectedShip: {
    borderWidth: 2,
    borderBottomWidth: 2,
    borderTopColor: p.selected,
    borderLeftColor: p.selected,
    borderRightColor: p.selected,
    borderBottomColor: p.selected,
  },
  preview: { borderWidth: 2, borderStyle: 'dashed' },
  bow: { fontWeight: '900' },
  hitMark: { color: p.pencil.hit, fontWeight: '900', position: 'absolute' },
  hitHalo: { position: 'absolute' },
  missDot: { backgroundColor: p.pencil.miss },
  target: { borderWidth: 2, borderColor: p.selected, alignItems: 'center', justifyContent: 'center' },
  targetMark: { color: p.selected, fontWeight: '900' },
}));
