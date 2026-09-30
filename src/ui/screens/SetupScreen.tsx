import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Coord,
  FLEET,
  Heading,
  SHIP_CLASSES,
  Ship,
  ShipClassId,
  defaultRng,
  fleetIsComplete,
  footprintIsFree,
  headingArrow,
  makeShip,
  randomFleet,
  rotateCW,
  shipAt,
  shipCells,
} from '../../engine';
import { emptyGrid, hullsOf, paintPreview, paintShips } from '../boardView';
import { Board } from '../components/Board';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { useBoardWidth } from '../hooks';
import { makeStyles, radius, spacing, useTheme } from '../theme';

interface Props {
  playerName: string;
  onReady: (ships: Ship[]) => void;
  onBack: () => void;
}

export function SetupScreen({ playerName, onReady, onBack }: Props) {
  const styles = useStyles();
  const { palette: p } = useTheme();
  const width = useBoardWidth();
  const [ships, setShips] = useState<Ship[]>([]);
  const [selected, setSelected] = useState<ShipClassId>('carrier');
  const [heading, setHeading] = useState<Heading>('E');
  const [badPreview, setBadPreview] = useState<Coord[] | null>(null);
  const [message, setMessage] = useState('Tap a cell to drop the bow. The hull extends behind it.');

  useEffect(() => {
    if (!badPreview) return;
    const t = setTimeout(() => setBadPreview(null), 600);
    return () => clearTimeout(t);
  }, [badPreview]);

  const placedIds = useMemo(() => new Set(ships.map((s) => s.classId)), [ships]);
  const selectedShip = ships.find((s) => s.classId === selected);

  const grid = useMemo(() => {
    const g = emptyGrid();
    paintShips(g, ships, selectedShip?.id);
    if (badPreview) paintPreview(g, badPreview, false);
    return g;
  }, [ships, selectedShip, badPreview]);
  const hulls = useMemo(() => hullsOf(ships, selectedShip?.id), [ships, selectedShip]);

  function place(classId: ShipClassId, bow: Coord, h: Heading): boolean {
    const others = ships.filter((s) => s.classId !== classId);
    const cells = shipCells(bow, h, SHIP_CLASSES[classId].length);
    if (!footprintIsFree(cells, others)) {
      setBadPreview(cells);
      setMessage(`${SHIP_CLASSES[classId].name} doesn't fit there.`);
      return false;
    }
    setShips([...others, makeShip(classId, bow, h)]);
    return true;
  }

  function onPressCell(coord: Coord) {
    // Tapping an already placed ship selects it for re-positioning.
    const hit = shipAt(ships, coord);
    if (hit && hit.ship.classId !== selected) {
      setSelected(hit.ship.classId);
      setHeading(hit.ship.heading);
      setMessage(`${SHIP_CLASSES[hit.ship.classId].name} selected. Tap a cell to move it or rotate it.`);
      return;
    }
    if (place(selected, coord, heading)) {
      // Advance to the next unplaced ship for a quick flow.
      const nextUnplaced = FLEET.find((id) => id !== selected && !placedIds.has(id));
      if (nextUnplaced) {
        setSelected(nextUnplaced);
        setMessage(`Now place the ${SHIP_CLASSES[nextUnplaced].name}.`);
      } else {
        setMessage('All ships placed. Tap a ship to adjust it, or start the battle.');
      }
    }
  }

  // A placed ship's own heading is the truth; `heading` only steers the next drop.
  const effectiveHeading = selectedShip ? selectedShip.heading : heading;

  function onRotate() {
    const next = rotateCW(effectiveHeading);
    if (selectedShip) {
      if (place(selected, selectedShip.bow, next)) setHeading(next);
    } else {
      setHeading(next);
    }
  }

  function onRandom() {
    const fleet = randomFleet(defaultRng);
    setShips(fleet);
    // Keep the heading control in step with whatever the selected hull now is.
    const sel = fleet.find((s) => s.classId === selected);
    if (sel) setHeading(sel.heading);
    setMessage('Fleet deployed at random. Adjust anything you like.');
  }

  const complete = fleetIsComplete(ships);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{playerName}: deploy your fleet</Text>
        <Text style={styles.message}>{message}</Text>
      </View>

      <Board grid={grid} hulls={hulls} width={width} onPressCell={onPressCell} />

      <View style={styles.tray}>
        {FLEET.map((id) => {
          const cls = SHIP_CLASSES[id];
          const isSel = id === selected;
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`${cls.name}, ${placedIds.has(id) ? 'placed' : 'not placed'}`}
              accessibilityState={{ selected: isSel }}
              onPress={() => {
                setSelected(id);
                const existing = ships.find((s) => s.classId === id);
                if (existing) setHeading(existing.heading);
              }}
              style={[styles.chip, isSel && styles.chipSelected]}
            >
              <View style={[styles.swatch, { backgroundColor: p.token.fill[id] }]} />
              <Text style={styles.chipText}>
                {cls.name} ({cls.length})
              </Text>
              <Text style={[styles.chipMark, placedIds.has(id) && styles.chipMarkDone]}>{placedIds.has(id) ? '✓' : '·'}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.row}>
        <View style={styles.flex}>
          <Button small variant="secondary" title={`Rotate ${headingArrow(effectiveHeading)}`} onPress={onRotate} />
        </View>
        <View style={styles.flex}>
          <Button small variant="secondary" title="Random" onPress={onRandom} />
        </View>
        <View style={styles.flex}>
          <Button small variant="ghost" title="Clear" onPress={() => setShips([])} disabled={ships.length === 0} />
        </View>
      </View>

      <Button title="Start battle" disabled={!complete} onPress={() => onReady(ships)} />
      <Button title="Back" variant="ghost" onPress={onBack} />
    </Screen>
  );
}

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  header: { gap: 4 },
  title: { ...ty.title, color: p.accent.text },
  message: { ...ty.caption, color: p.ink.secondary, minHeight: 18 },
  tray: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: p.surface.raised,
    borderWidth: 1,
    borderColor: p.surface.border,
  },
  chipSelected: { borderColor: p.selected, borderWidth: 2 },
  chipText: { ...ty.caption, color: p.ink.primary },
  chipMark: { ...ty.label, color: p.ink.secondary },
  chipMarkDone: { color: p.signal.success },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
}));
