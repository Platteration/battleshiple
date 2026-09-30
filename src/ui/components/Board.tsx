import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Coord, Quadrant, headingArrow } from '../../engine';
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

const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * A shot mark older than this many half-turns is drawn in the aged colour: the
 * viewer's own last two shots, or the opponent's last one, stay fresh. Ageing
 * changes the colour, never the opacity; the old opacity floor of 0.35 took
 * the marks below every contrast floor on the water.
 */
export const FRESH_AGE = 2;

/** Where each quadrant's label sits: the top-left corner of the quadrant. */
const SECTORS: { q: Quadrant; top: boolean; left: boolean }[] = [
  { q: 'NW', top: true, left: true },
  { q: 'NE', top: true, left: false },
  { q: 'SW', top: false, left: true },
  { q: 'SE', top: false, left: false },
];

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
    const aged = cell.shot.age > FRESH_AGE;
    if (cell.shot.result === 'miss') {
      nodes.push(
        <View
          key="miss"
          testID={aged ? 'mark-aged' : 'mark-fresh'}
          style={[
            styles.missDot,
            { width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15 },
            aged && styles.agedFill,
          ]}
        />,
      );
    } else {
      nodes.push(
        <Text key="staleHit" testID={aged ? 'mark-aged' : 'mark-fresh'} style={[styles.hitMark, { fontSize }, aged && styles.agedText]}>
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
  const size = grid.length;
  const cell = Math.floor(width / (size + 1));
  const playSize = cell * size;
  const labelFont = Math.max(9, cell * 0.4);
  const sectorFont = Math.max(8, cell * 0.28);
  // The dividers sit on the boundary quadrantOf uses: half the size, in cells.
  const half = (size / 2) * cell;

  return (
    <View style={[styles.wrapper, { width: cell * (size + 1) }]}>
      <View style={styles.row}>
        <View style={{ width: cell, height: cell }} />
        {Array.from({ length: size }, (_, c) => (
          <View key={c} style={[styles.label, { width: cell, height: cell }]}>
            <Text style={[styles.labelText, { fontSize: labelFont }]}>{COLS[c]}</Text>
          </View>
        ))}
      </View>
      <View style={styles.row}>
        <View>
          {Array.from({ length: size }, (_, r) => (
            <View key={r} style={[styles.label, { width: cell, height: cell }]}>
              <Text style={[styles.labelText, { fontSize: labelFont }]}>{r + 1}</Text>
            </View>
          ))}
        </View>
        <View style={{ width: playSize, height: playSize }}>
          {/* Layers, bottom up. Everything but the cells is drawn only, never pressed. */}
          <View testID="board-water" pointerEvents="none" style={[StyleSheet.absoluteFill, styles.water]}>
            {Array.from({ length: size - 1 }, (_, i) => (
              <React.Fragment key={i}>
                <View style={[styles.gridLine, { left: (i + 1) * cell, top: 0, bottom: 0, width: 1 }]} />
                <View style={[styles.gridLine, { top: (i + 1) * cell, left: 0, right: 0, height: 1 }]} />
              </React.Fragment>
            ))}
          </View>
          <View testID="board-chart" pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View testID="divider-v" style={[styles.divider, { left: half - 1, top: 0, bottom: 0, width: 2 }]} />
            <View testID="divider-h" style={[styles.divider, { top: half - 1, left: 0, right: 0, height: 2 }]} />
            {SECTORS.map(({ q, top, left }) => (
              <Text
                key={q}
                accessible={false}
                style={[styles.sector, { fontSize: sectorFont, top: (top ? 0 : half) + 2, left: (left ? 0 : half) + 4 }]}
              >
                {q}
              </Text>
            ))}
          </View>
          <View testID="board-intel" pointerEvents="none" style={StyleSheet.absoluteFill}>
            <SplashOverlay size={playSize} quadrants={splashes} />
          </View>
          {grid.map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((cv, c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={`${COLS[c]}${r + 1}`}
                  // The locked target is the one cell FIRE will act on, so a screen reader is told which it is.
                  accessibilityState={{ disabled: disabled || !onPressCell, selected: !!cv.target }}
                  disabled={disabled || !onPressCell}
                  onPress={() => onPressCell?.({ r, c })}
                  style={[styles.cell, { width: cell, height: cell }]}
                >
                  <CellContent cell={cv} size={cell} />
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  wrapper: { alignSelf: 'center' },
  row: { flexDirection: 'row' },
  label: { alignItems: 'center', justifyContent: 'center' },
  labelText: { ...ty.coord, color: p.board.label },
  water: { backgroundColor: p.board.water, borderWidth: 1, borderColor: p.board.grid },
  gridLine: { position: 'absolute', backgroundColor: p.board.grid },
  divider: { position: 'absolute', backgroundColor: p.board.sectorLine },
  sector: { ...ty.label, position: 'absolute', lineHeight: undefined, letterSpacing: 0.5, color: p.board.sectorLabel },
  cell: {
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
  agedFill: { backgroundColor: p.pencil.aged },
  agedText: { color: p.pencil.aged },
  target: { borderWidth: 2, borderColor: p.selected, alignItems: 'center', justifyContent: 'center' },
  targetMark: { color: p.selected, fontWeight: '900' },
}));
