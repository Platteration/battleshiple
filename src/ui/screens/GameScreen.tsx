import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Coord,
  GameState,
  Maneuver,
  PlayerIndex,
  QUADRANT_NAMES,
  SHIP_CLASSES,
  Ship,
  checkManeuver,
  coordLabel,
  isSunk,
  opponentOf,
  projectedCells,
  shipAt,
  shipsRemaining,
  visibleLog,
} from '../../engine';
import { buildFleetView, buildTrackingView } from '../boardView';
import { Board } from '../components/Board';
import { Button } from '../components/Button';
import { FleetStatus } from '../components/FleetStatus';
import { ManeuverPanel } from '../components/ManeuverPanel';
import { Screen } from '../components/Screen';
import { useBoardWidth } from '../hooks';
import { colors, radius, spacing } from '../theme';

interface Props {
  state: GameState;
  viewer: PlayerIndex;
  busy?: boolean;
  onFire: (coord: Coord) => void;
  onManeuver: (shipId: string, m: Maneuver) => void;
  onEndTurn: () => void;
  onQuit: () => void;
}

type Tab = 'enemy' | 'fleet';

/** What happened to the viewer since their last turn, phrased without leaking enemy moves. */
function incomingReport(state: GameState, viewer: PlayerIndex): string[] {
  const me = state.players[viewer];
  const enemy = state.players[opponentOf(viewer)];
  const lines: string[] = [];
  // Read the snapshot taken when the shot landed. Deriving this from live hulls
  // instead misreports the moment you evade with the ship that was just hit.
  const hit = me.lastIncoming;
  if (hit && hit.turn === state.turn - 1) {
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

export function GameScreen({ state, viewer, busy, onFire, onManeuver, onEndTurn, onQuit }: Props) {
  const width = useBoardWidth();
  const me = state.players[viewer];
  const enemy = state.players[opponentOf(viewer)];
  const myTurn = state.current === viewer && !busy;
  const phase = state.phase;

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
  }, [phase, state.turn]);

  const selectedShip: Ship | undefined = me.ships.find((s) => s.id === selectedShipId);
  const preview = useMemo(() => {
    if (!selectedShip || !pending) return undefined;
    return { cells: projectedCells(selectedShip, pending), ok: checkManeuver(selectedShip, pending, me.ships).ok };
  }, [selectedShip, pending, me.ships]);

  const trackingGrid = useMemo(() => buildTrackingView(me, enemy, state.turn, target), [me, enemy, state.turn, target]);
  const fleetGrid = useMemo(
    () => buildFleetView(me, enemy, state.turn, { selectedShipId, preview }),
    [me, enemy, state.turn, selectedShipId, preview],
  );

  const report = useMemo(() => incomingReport(state, viewer), [state, viewer]);
  const recentLog = useMemo(() => visibleLog(state, viewer).slice(-4).reverse(), [state, viewer]);
  const hasMoved = !!state.maneuveredShipId;

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

  const lastShot = state.lastShot;
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

  const turnNumber = Math.floor(state.turn / 2) + 1;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{me.name}</Text>
          <Text style={styles.turn}>Turn {turnNumber}</Text>
        </View>
        <Text style={styles.fleetCount}>
          Your ships: {shipsRemaining(me.ships)}/{me.ships.length} · Enemy ships: {shipsRemaining(enemy.ships)}/
          {enemy.ships.length}
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

      <View style={styles.tabs}>
        {(['enemy', 'fleet'] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
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

const styles = StyleSheet.create({
  header: { gap: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { color: colors.accent, fontSize: 22, fontWeight: '900' },
  turn: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  fleetCount: { color: colors.textDim, fontSize: 13 },
  report: {
    backgroundColor: 'rgba(155, 224, 255, 0.12)',
    borderColor: colors.splash,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
  },
  reportText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  tabs: { flexDirection: 'row', backgroundColor: colors.panel, borderRadius: radius.md, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.textDim, fontWeight: '700' },
  tabTextActive: { color: colors.accentText },
  status: { color: colors.text, fontSize: 14, textAlign: 'center', minHeight: 20, fontWeight: '600' },
  maneuverBlock: { gap: spacing.sm },
  log: { gap: 2, paddingHorizontal: spacing.xs },
  logText: { color: colors.textDim, fontSize: 12 },
});
