import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Coord,
  Maneuver,
  PlayerView,
  QUADRANT_NAMES,
  SHIP_CLASSES,
  Ship,
  afloatCount,
  checkManeuver,
  coordLabel,
  isSunk,
  projectedCells,
  shipAt,
  shipsRemaining,
} from '../../engine';
import { buildFleetView, buildTrackingView } from '../boardView';
import { Board } from '../components/Board';
import { Button } from '../components/Button';
import { FleetStatus } from '../components/FleetStatus';
import { ManeuverPanel } from '../components/ManeuverPanel';
import { Screen } from '../components/Screen';
import { useBoardWidth } from '../hooks';
import { makeStyles, radius, spacing } from '../theme';

interface Props {
  /**
   * The viewer's redacted view, never the whole GameState: an opponent ship
   * still afloat has no position here, so this screen cannot draw one.
   */
  view: PlayerView;
  busy?: boolean;
  onFire: (coord: Coord) => void;
  onManeuver: (shipId: string, m: Maneuver) => void;
  onEndTurn: () => void;
  onQuit: () => void;
}

type Tab = 'enemy' | 'fleet';

/** What happened to the viewer since their last turn, phrased without leaking enemy moves. */
function incomingReport(view: PlayerView): string[] {
  const { me, enemy } = view;
  const lines: string[] = [];
  // Read the snapshot taken when the shot landed. Deriving this from live hulls
  // instead misreports the moment you evade with the ship that was just hit.
  const hit = me.lastIncoming;
  if (hit && hit.turn === view.turn - 1) {
    const label = coordLabel(hit);
    if (hit.result === 'miss') {
      lines.push(`${enemy.name} fired at ${label} and missed.`);
    } else {
      const name = hit.classId ? SHIP_CLASSES[hit.classId].name : 'ship';
      lines.push(
        hit.sunk
          ? `${enemy.name} fired at ${label} – your ${name} is sunk!`
          : `${enemy.name} fired at ${label} and hit your ${name}!`,
      );
    }
  }
  for (const sp of me.splashes) {
    lines.push(`Splash! Something moved in the ${QUADRANT_NAMES[sp.quadrant]} of enemy waters.`);
  }
  return lines;
}

export function GameScreen({ view, busy, onFire, onManeuver, onEndTurn, onQuit }: Props) {
  const styles = useStyles();
  const width = useBoardWidth();
  const { me, enemy, viewer } = view;
  const myTurn = view.current === viewer && !busy;
  const phase = view.phase;

  const [tab, setTab] = useState<Tab>('enemy');
  const [target, setTarget] = useState<Coord | undefined>();
  const [selectedShipId, setSelectedShipId] = useState<string | undefined>();
  const [pending, setPending] = useState<Maneuver | null>(null);

  // Follow the phase: aim on the enemy board, manoeuvre on your own.
  useEffect(() => {
    if (phase === 'fire') {
      setTab('enemy');
      setTarget(undefined);
    } else if (phase === 'maneuver') {
      setTab('fleet');
    }
    setSelectedShipId(undefined);
    setPending(null);
  }, [phase, view.turn]);

  const selectedShip: Ship | undefined = me.ships.find((s) => s.id === selectedShipId);
  const preview = useMemo(() => {
    if (!selectedShip || !pending) return undefined;
    return { cells: projectedCells(selectedShip, pending), ok: checkManeuver(selectedShip, pending, me.ships).ok };
  }, [selectedShip, pending, me.ships]);

  const trackingGrid = useMemo(() => buildTrackingView(view, target), [view, target]);
  const fleetGrid = useMemo(
    () => buildFleetView(view, { selectedShipId, preview }),
    [view, selectedShipId, preview],
  );

  const report = useMemo(() => incomingReport(view), [view]);
  const recentLog = useMemo(() => view.log.slice(-4).reverse(), [view]);
  const hasMoved = !!view.maneuveredShipId;

  function onPressEnemyCell(coord: Coord) {
    if (!myTurn || phase !== 'fire') return;
    setTarget(coord);
  }

  function onPressFleetCell(coord: Coord) {
    if (!myTurn || phase !== 'maneuver' || hasMoved) return;
    const found = shipAt(me.ships, coord);
    if (found && !isSunk(found.ship)) {
      setSelectedShipId(found.ship.id);
      setPending(null);
    }
  }

  function confirmManeuver() {
    if (selectedShip && pending && preview?.ok) {
      onManeuver(selectedShip.id, pending);
      setPending(null);
    }
  }

  const lastShot = view.lastShot;
  let statusLine = '';
  if (busy) statusLine = `${enemy.name} is taking their turn…`;
  else if (phase === 'fire') statusLine = target ? `Target ${coordLabel(target)} locked. Fire when ready.` : 'Choose a target in enemy waters.';
  else if (phase === 'maneuver' && lastShot && lastShot.by === viewer) {
    const label = coordLabel(lastShot.coord);
    if (lastShot.result === 'miss') statusLine = `${label}: splash, miss.`;
    else if (lastShot.sunk) statusLine = `${label}: HIT – enemy ${SHIP_CLASSES[lastShot.sunk.classId].name} sunk!`;
    else if (lastShot.alreadyDamaged) statusLine = `${label}: hit, but that section was already wrecked.`;
    else statusLine = `${label}: HIT!`;
    statusLine += hasMoved ? ' Manoeuvre complete – end your turn.' : ' Now manoeuvre one ship, or hold position.';
  }

  const turnNumber = Math.floor(view.turn / 2) + 1;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{me.name}</Text>
          <Text style={styles.turn}>Turn {turnNumber}</Text>
        </View>
        <Text style={styles.fleetCount}>
          Your ships: {shipsRemaining(me.ships)}/{me.ships.length} · Enemy ships: {afloatCount(enemy.fleet)}/
          {enemy.fleet.length}
        </Text>
      </View>

      {report.length > 0 && (
        <View style={styles.report}>
          {report.map((line, i) => (
            <Text key={i} style={styles.reportText}>
              {line}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.tabs} accessibilityRole="tablist">
        {(['enemy', 'fleet'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'enemy' ? 'Enemy waters' : 'Your fleet'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'enemy' ? (
        <Board grid={trackingGrid} width={width} onPressCell={onPressEnemyCell} splashes={me.splashes.map((s) => s.quadrant)} disabled={!myTurn || phase !== 'fire'} />
      ) : (
        <Board grid={fleetGrid} width={width} onPressCell={onPressFleetCell} disabled={!myTurn || phase !== 'maneuver'} />
      )}

      <Text style={styles.status}>{statusLine}</Text>

      {myTurn && phase === 'fire' && (
        <Button title={target ? `FIRE at ${coordLabel(target)}` : 'Select a target'} disabled={!target} onPress={() => target && onFire(target)} />
      )}

      {myTurn && phase === 'maneuver' && (
        <View style={styles.maneuverBlock}>
          {!hasMoved && (
            <>
              <FleetStatus
                ships={me.ships}
                selectedId={selectedShipId}
                onSelect={(ship) => {
                  setSelectedShipId(ship.id);
                  setPending(null);
                  setTab('fleet');
                }}
                compact
              />
              <ManeuverPanel
                ship={selectedShip}
                fleet={me.ships}
                pending={pending}
                onPick={(m) => {
                  setPending(m);
                  setTab('fleet');
                }}
                onConfirm={confirmManeuver}
                onCancel={() => setPending(null)}
              />
            </>
          )}
          <Button title={hasMoved ? 'End turn' : 'Hold position & end turn'} variant={hasMoved ? 'primary' : 'secondary'} onPress={onEndTurn} />
        </View>
      )}

      {tab === 'fleet' && phase === 'fire' && <FleetStatus ships={me.ships} compact />}

      <View style={styles.log}>
        {recentLog.map((e, i) => (
          <Text key={`${e.turn}-${i}`} style={styles.logText}>
            {e.text}
          </Text>
        ))}
      </View>

      <Button title="Quit to menu" variant="ghost" small onPress={onQuit} />
    </Screen>
  );
}

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  header: { gap: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { ...ty.title, color: p.accent.text },
  turn: { ...ty.label, color: p.ink.secondary },
  fleetCount: { ...ty.caption, color: p.ink.secondary },
  report: {
    backgroundColor: p.intel.fill,
    borderColor: p.intel.stroke,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
  },
  reportText: { ...ty.teletype, color: p.ink.primary },
  tabs: { flexDirection: 'row', backgroundColor: p.surface.raised, borderRadius: radius.md, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: p.accent.fill },
  tabText: { ...ty.action, fontSize: 14, lineHeight: 18, color: p.ink.secondary },
  tabTextActive: { color: p.ink.onAccent },
  status: { ...ty.heading, fontSize: 15, lineHeight: 20, color: p.ink.primary, textAlign: 'center', minHeight: 20 },
  maneuverBlock: { gap: spacing.sm },
  log: { gap: 2, paddingHorizontal: spacing.xs },
  logText: { ...ty.teletype, fontSize: 12, lineHeight: 16, color: p.ink.secondary },
}));
