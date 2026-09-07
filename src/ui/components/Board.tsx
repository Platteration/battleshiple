import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BOARD_SIZE, Coord, Quadrant, headingArrow } from '../../engine';
import { CellView, Grid } from '../boardView';
import { colors, shipColors } from '../theme';
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
  const fontSize = Math.max(10, size * 0.55);
  const nodes: React.ReactNode[] = [];

  if (cell.ship) {
    const s = cell.ship;
    nodes.push(
      <View
        key="ship"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: s.sunk ? colors.sunk : shipColors[s.classId],
            opacity: s.sunk ? 0.9 : s.ready ? 1 : 0.6,
            margin: 1,
            borderRadius: 3,
          },
          s.selected && styles.selectedShip,
        ]}
      />,
    );
    if (s.isBow && !s.sunk) {
      nodes.push(
        <Text key="bow" style={[styles.bow, { fontSize: fontSize * 0.8 }]}>
          {headingArrow(s.heading)}
        </Text>,
      );
    }
    if (s.hit) {
      nodes.push(
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
    nodes.push(
      <View
        key="preview"
        style={[StyleSheet.absoluteFill, { backgroundColor: cell.preview === 'ok' ? colors.previewOk : colors.previewBad }]}
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

const styles = StyleSheet.create({
  wrapper: { alignSelf: 'center' },
  row: { flexDirection: 'row' },
  label: { alignItems: 'center', justifyContent: 'center' },
  labelText: { color: colors.textDim, fontWeight: '600' },
  cell: {
    backgroundColor: colors.water,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.waterLine,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  selectedShip: { borderWidth: 2, borderColor: colors.selected },
  bow: { color: 'rgba(0,0,0,0.65)', fontWeight: '900' },
  hitMark: { color: colors.hit, fontWeight: '900', position: 'absolute' },
  missDot: { backgroundColor: colors.miss },
  target: { borderWidth: 2, borderColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  targetMark: { color: colors.selected, fontWeight: '900' },
});
