import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
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
  describeManeuver,
  isSunk,
  projectedCells,
  shipAt,
  shipsRemaining,
} from '../../engine';
import { buildFleetView, buildTrackingView, fleetHulls, trackingHulls } from '../boardView';
import { Board } from '../components/Board';
import { Button } from '../components/Button';
import { FleetStatus } from '../components/FleetStatus';
import { ManeuverPanel } from '../components/ManeuverPanel';
import { MiniPlot } from '../components/MiniPlot';
import { Screen } from '../components/Screen';
import { useGameLayout } from '../layout';
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

type Side = 'enemy' | 'fleet';

const SIDE_NAME: Record<Side, string> = { enemy: 'Enemy waters', fleet: 'Your fleet' };

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
  const { boardWidth: width, compact } = useGameLayout();
  const { me, enemy, viewer } = view;
  const myTurn = view.current === viewer && !busy;
  const phase = view.phase;

  // A look at the other board, from the mini-map. The turn moving on ends it.
  const [peek, setPeek] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [target, setTarget] = useState<Coord | undefined>();
  const [selectedShipId, setSelectedShipId] = useState<string | undefined>();
  const [pending, setPending] = useState<Maneuver | null>(null);

  // Follow the phase: aim on the enemy board, manoeuvre on your own.
  useEffect(() => {
    if (phase === 'fire') setTarget(undefined);
    setPeek(false);
    setSelectedShipId(undefined);
    setPending(null);
  }, [phase, view.turn]);

  const selectedShip: Ship | undefined = me.ships.find((s) => s.id === selectedShipId);
  const preview = useMemo(() => {
    if (!selectedShip || !pending) return undefined;
    return { cells: projectedCells(selectedShip, pending), ok: checkManeuver(selectedShip, pending, me.ships).ok };
  }, [selectedShip, pending, me.ships]);

  const trackingGrid = useMemo(() => buildTrackingView(view, target), [view, target]);
  const wrecks = useMemo(() => trackingHulls(view), [view]);
  const myHulls = useMemo(() => fleetHulls(view, selectedShipId), [view, selectedShipId]);
  const fleetGrid = useMemo(
    () => buildFleetView(view, { selectedShipId, preview }),
    [view, selectedShipId, preview],
  );

  const fullReport = useMemo(() => incomingReport(view), [view]);
  // A short screen keeps the newest line; the log below still has the rest.
  const report = compact ? fullReport.slice(-1) : fullReport;
  // The strip shows what happened since your last turn; with nothing new, the latest log line.
  const lastLog = view.log[view.log.length - 1];
  const strip = report.length > 0 ? report : lastLog ? [lastLog.text] : [];
  const hasMoved = !!view.maneuveredShipId;

  // The large board is the one you act on: your fleet while you manoeuvre, enemy waters otherwise.
  const acting: Side = myTurn && phase === 'maneuver' ? 'fleet' : 'enemy';
  const big: Side = peek ? (acting === 'enemy' ? 'fleet' : 'enemy') : acting;
  const small: Side = big === 'enemy' ? 'fleet' : 'enemy';
  const miniSize = compact ? 48 : 64;

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
  // With no target the action bar itself says what to do; the line stays empty rather than repeat it.
  else if (phase === 'fire') statusLine = target ? `Target ${coordLabel(target)} locked. Fire when ready.` : '';
  else if (phase === 'maneuver' && lastShot && lastShot.by === viewer) {
    const label = coordLabel(lastShot.coord);
    // Not "splash, miss": a splash is the manoeuvre report, and a miss is not one.
    if (lastShot.result === 'miss') statusLine = `${label}: miss.`;
    else if (lastShot.sunk) statusLine = `${label}: HIT – enemy ${SHIP_CLASSES[lastShot.sunk.classId].name} sunk!`;
    else if (lastShot.alreadyDamaged) statusLine = `${label}: hit, but that section was already wrecked.`;
    else statusLine = `${label}: HIT!`;
    statusLine += hasMoved ? ' Manoeuvre complete – end your turn.' : ' Now manoeuvre one ship, or hold position.';
  }

  const turnNumber = Math.floor(view.turn / 2) + 1;

  return (
    <Screen scroll={false}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerText}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{me.name}</Text>
              <Text style={styles.turn}>Turn {turnNumber}</Text>
            </View>
            <Text style={styles.fleetCount}>
              Afloat: {shipsRemaining(me.ships)}/{me.ships.length} · Enemy: {afloatCount(enemy.fleet)}/{enemy.fleet.length}
            </Text>
          </View>
          <MiniPlot
            size={miniSize}
            label={`Show ${SIDE_NAME[small].toLowerCase()}`}
            grid={small === 'enemy' ? trackingGrid : fleetGrid}
            hulls={small === 'enemy' ? wrecks : myHulls}
            splashes={small === 'enemy' ? me.splashes : []}
            onPress={() => setPeek((v) => !v)}
          />
          <Button title="Quit to menu" variant="ghost" small onPress={onQuit} />
        </View>

        {strip.length > 0 && (
          <View style={[styles.report, report.length === 0 && styles.reportQuiet]}>
            {/* The lines are never inside a Pressable: the log button is their sibling. */}
            <View style={styles.reportLines}>
              {strip.map((line, i) => (
                // Two lines at most, so the board keeps its size; the log has every word.
                <Text key={i} style={styles.reportText} numberOfLines={2}>
                  {line}
                </Text>
              ))}
            </View>
            <Button title="Log" variant="ghost" small onPress={() => setLogOpen(true)} />
          </View>
        )}

        {/* Only while peeking: otherwise the board is the one the turn is about, and
            the status line and action bar already say which. */}
        {peek && <Text style={styles.caption}>{SIDE_NAME[big]} · tap the plot to return</Text>}

        {big === 'enemy' ? (
          <Board grid={trackingGrid} hulls={wrecks} width={width} onPressCell={onPressEnemyCell} splashes={me.splashes} disabled={!myTurn || phase !== 'fire'} />
        ) : (
          <Board grid={fleetGrid} hulls={myHulls} width={width} onPressCell={onPressFleetCell} disabled={!myTurn || phase !== 'maneuver'} />
        )}

        {statusLine ? (
          <Text style={styles.status} numberOfLines={2}>
            {statusLine}
          </Text>
        ) : null}

        {myTurn && phase === 'maneuver' && !hasMoved && (
          <>
            {!compact && (
              <FleetStatus
                ships={me.ships}
                selectedId={selectedShipId}
                onSelect={(ship) => {
                  setSelectedShipId(ship.id);
                  setPending(null);
                  setPeek(false);
                }}
                compact
              />
            )}
            <ManeuverPanel
              ship={selectedShip}
              fleet={me.ships}
              pending={pending}
              compact={compact}
              onPick={(m) => {
                setPending(m);
                setPeek(false);
              }}
            />
          </>
        )}

        {big === 'fleet' && phase !== 'maneuver' && !compact && <FleetStatus ships={me.ships} compact />}
      </ScrollView>

      <Modal visible={logOpen} transparent animationType="fade" onRequestClose={() => setLogOpen(false)}>
        <View style={styles.sheetScrim}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Signal log</Text>
            {/* view.log is visibleLog: the opponent's manoeuvres were never in it. */}
            <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
              {view.log.length === 0 ? <Text style={styles.sheetEmpty}>No signals yet.</Text> : null}
              {[...view.log].reverse().map((e, i) => (
                <Text key={`${e.turn}-${i}`} style={styles.sheetLine}>
                  {e.text}
                </Text>
              ))}
            </ScrollView>
            <Button title="Close" variant="secondary" onPress={() => setLogOpen(false)} />
          </View>
        </View>
      </Modal>

      {/* Pinned outside the scroll view: the one action this turn needs is never below the fold. */}
      <View style={styles.actionBar}>
        {myTurn && phase === 'fire' && (
          <Button
            title={target ? `FIRE at ${coordLabel(target)}` : 'Choose a target in enemy waters'}
            variant={target ? 'primary' : 'secondary'}
            disabled={!target}
            onPress={() => target && onFire(target)}
          />
        )}
        {myTurn && phase === 'maneuver' && pending && (
          <View style={styles.actionRow}>
            <View style={styles.flex}>
              <Button variant="ghost" title="Cancel" onPress={() => setPending(null)} />
            </View>
            <View style={styles.flex2}>
              <Button title={`Confirm: ${describeManeuver(pending)}`} disabled={!preview?.ok} onPress={confirmManeuver} />
            </View>
          </View>
        )}
        {myTurn && phase === 'maneuver' && !pending && (
          <Button title={hasMoved ? 'End turn' : 'Hold position & end turn'} variant={hasMoved ? 'primary' : 'secondary'} onPress={onEndTurn} />
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  scroll: { flex: 1 },
  content: { gap: spacing.sm, paddingBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerText: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  title: { ...ty.title, color: p.accent.text },
  turn: { ...ty.label, color: p.ink.secondary },
  fleetCount: { ...ty.caption, color: p.ink.secondary },
  report: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: p.intel.fill,
    borderColor: p.intel.stroke,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
  },
  reportQuiet: { backgroundColor: 'transparent', borderColor: p.surface.border },
  reportLines: { flex: 1, gap: 2 },
  reportText: { ...ty.teletype, color: p.ink.primary },
  caption: { ...ty.label, color: p.ink.secondary, textAlign: 'center' },
  status: { ...ty.heading, fontSize: 15, lineHeight: 20, color: p.ink.primary, textAlign: 'center', minHeight: 20 },
  // Tall enough for one button whether or not it is your turn, so the board never shifts.
  actionBar: { paddingTop: spacing.sm, minHeight: 56 },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  flex2: { flex: 2 },
  sheetScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: p.surface.scrim },
  sheet: {
    maxHeight: '75%',
    backgroundColor: p.surface.raised,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { ...ty.title, color: p.accent.text },
  sheetList: { flexGrow: 0 },
  sheetListContent: { gap: spacing.xs },
  sheetLine: { ...ty.teletype, color: p.ink.primary },
  sheetEmpty: { ...ty.caption, color: p.ink.secondary },
}));
