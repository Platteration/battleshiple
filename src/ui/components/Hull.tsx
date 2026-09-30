import React from 'react';
import { Text, View, ViewStyle } from 'react-native';
import { headingArrow, ShipClassId } from '../../engine';
import { HullView } from '../boardView';
import { makeStyles, useTheme } from '../theme';

/** Gap between a hull and the edge of its footprint, so neighbours read as two pieces. */
export const HULL_INSET = 2;

/**
 * One feature on the deck: centred on cell `at` counted from the bow, `along`
 * and `across` the hull as fractions of a cell, shifted `offset` of a cell off
 * the centreline. Shape is what tells the classes apart without colour.
 */
interface Detail {
  at: number;
  along: number;
  across: number;
  offset?: number;
  round?: boolean;
}

export const DETAILS: Record<ShipClassId, Detail[]> = {
  // The island, off to one side of a flat deck.
  carrier: [{ at: 3, along: 0.8, across: 0.24, offset: 0.2 }],
  battleship: [1, 2, 3].map((at) => ({ at, along: 0.34, across: 0.34, round: true })),
  destroyer: [1, 2].map((at) => ({ at, along: 0.26, across: 0.26, round: true })),
  // The sail: long and narrow, rounded.
  submarine: [{ at: 1, along: 0.56, across: 0.26, round: true }],
  patrol: [{ at: 1, along: 0.32, across: 0.32 }],
};

const inset = (n: number): ViewStyle => ({ top: n, left: n, right: n, bottom: n });

/** Corner radii with the bow end fully round and the stern nearly square. */
function radii(h: HullView, bow: number, stern: number): ViewStyle {
  const startIsBow = h.bowAt === 'start';
  const start = startIsBow ? bow : stern;
  const end = startIsBow ? stern : bow;
  return h.horizontal
    ? { borderTopLeftRadius: start, borderBottomLeftRadius: start, borderTopRightRadius: end, borderBottomRightRadius: end }
    : { borderTopLeftRadius: start, borderTopRightRadius: start, borderBottomLeftRadius: end, borderBottomRightRadius: end };
}

/** Distance along the hull, from the footprint's top/left, of the centre of cell `at` counted from the bow. */
function along(h: HullView, at: number, cell: number): number {
  const fromStart = h.bowAt === 'start' ? at : h.length - 1 - at;
  return (fromStart + 0.5) * cell;
}

/** One continuous silhouette over a ship's footprint. Drawn only: presses go to the cells above it. */
export function Hull({ hull: h, cell }: { hull: HullView; cell: number }) {
  const styles = useStyles();
  const { palette: p } = useTheme();
  const long = h.length * cell;
  const width = h.horizontal ? long : cell;
  const height = h.horizontal ? cell : long;
  const thick = cell - HULL_INSET * 2;
  const opacity = h.sunk ? 0.9 : h.ready ? 1 : 0.6;
  const arrowSize = Math.max(10, cell * 0.55) * 0.8;

  const place = (a: number, w: number, across: number, offset = 0): ViewStyle => {
    const alongLen = w * cell;
    const acrossLen = across * cell;
    const mid = cell / 2 + offset * cell;
    return h.horizontal
      ? { left: a - alongLen / 2, top: mid - acrossLen / 2, width: alongLen, height: acrossLen }
      : { top: a - alongLen / 2, left: mid - acrossLen / 2, width: acrossLen, height: alongLen };
  };

  return (
    <View
      pointerEvents="none"
      testID={`hull-footprint-${h.classId}`}
      style={[styles.footprint, { left: h.c * cell, top: h.r * cell, width, height }]}
    >
      {/* The crisp outline. When selected it takes the selection colour, so the ring
          reads as a frame against the water (>=3:1 in both palettes). */}
      <View
        testID={`hull-plate-${h.classId}`}
        style={[
          styles.fill,
          { ...inset(HULL_INSET), backgroundColor: h.selected ? p.selected : p.token.stroke },
          radii(h, thick / 2, 5),
        ]}
      />
      <View
        testID={`hull-${h.classId}`}
        style={[
          styles.fill,
          {
            ...inset(HULL_INSET + 1),
            backgroundColor: h.sunk ? p.token.sunk : p.token.fill[h.classId],
            opacity,
            // Shallow tabletop depth (VISUAL_STYLE.md): a small upper-left
            // highlight and one short lower edge.
            borderWidth: 1,
            borderTopColor: p.depth.highlight,
            borderLeftColor: p.depth.highlightSoft,
            borderRightColor: p.depth.shade,
            borderBottomColor: p.depth.edge,
            borderBottomWidth: 3,
          },
          radii(h, (thick - 2) / 2, 4),
          h.selected && styles.selected,
        ]}
      />
      {!h.sunk &&
        DETAILS[h.classId].map((d, i) => (
          <View
            key={i}
            testID={`hull-detail-${h.classId}`}
            style={[
              styles.detail,
              place(along(h, d.at, cell), d.along, d.across, d.offset),
              { backgroundColor: p.token.mark[h.classId], opacity, borderRadius: d.round ? cell : 2 },
            ]}
          />
        ))}
      {!h.sunk && (
        <View style={[styles.bow, h.horizontal ? { left: along(h, 0, cell) - cell / 2, top: 0 } : { top: along(h, 0, cell) - cell / 2, left: 0 }, { width: cell, height: cell }]}>
          <Text style={[styles.bowText, { color: p.token.mark[h.classId], fontSize: arrowSize }]}>{headingArrow(h.heading)}</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ palette: p }) => ({
  footprint: { position: 'absolute' },
  fill: { position: 'absolute' },
  // Per-side colours resolve ahead of `borderColor`, so the ring must name
  // every side or the bevel (set per side above) wins and no ring shows.
  selected: {
    borderWidth: 2,
    borderBottomWidth: 2,
    borderTopColor: p.selected,
    borderLeftColor: p.selected,
    borderRightColor: p.selected,
    borderBottomColor: p.selected,
  },
  detail: { position: 'absolute' },
  bow: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  bowText: { fontWeight: '900' },
}));
