import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Maneuver,
  SHIP_CLASSES,
  Ship,
  checkManeuver,
  cooldownFor,
  damageOf,
  describeManeuver,
  mobilityOf,
} from '../../engine';
import { colors, radius, spacing } from '../theme';
import { Button } from './Button';

interface Props {
  ship?: Ship;
  fleet: readonly Ship[];
  /** Manoeuvre currently previewed on the board, awaiting confirmation. */
  pending: Maneuver | null;
  onPick: (m: Maneuver) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

interface Control {
  label: string;
  maneuver: Maneuver;
}

function sameManeuver(a: Maneuver | null, b: Maneuver): boolean {
  return !!a && a.kind === b.kind && (a.distance ?? 1) === (b.distance ?? 1);
}

/** Buttons for every manoeuvre kind; tap once to preview, confirm to execute. */
export function ManeuverPanel({ ship, fleet, pending, onPick, onConfirm, onCancel }: Props) {
  if (!ship) {
    return (
      <View style={styles.panel}>
        <Text style={styles.hint}>Tap one of your ships (or a card above) to manoeuvre it, or hold position.</Text>
      </View>
    );
  }
  const cls = SHIP_CLASSES[ship.classId];
  const mobility = mobilityOf(ship);
  const rows: Control[][] = [
    [
      { label: '▲ Ahead 1', maneuver: { kind: 'ahead', distance: 1 } },
      { label: '▲▲ Ahead 2', maneuver: { kind: 'ahead', distance: 2 } },
    ],
    [
      { label: '▼ Astern 1', maneuver: { kind: 'astern', distance: 1 } },
      { label: '▼▼ Astern 2', maneuver: { kind: 'astern', distance: 2 } },
    ],
    [
      { label: '◀ Port', maneuver: { kind: 'port' } },
      { label: 'Starboard ▶', maneuver: { kind: 'starboard' } },
    ],
    [
      { label: '↺ Turn CCW', maneuver: { kind: 'rotateCCW' } },
      { label: '↻ Turn CW', maneuver: { kind: 'rotateCW' } },
    ],
  ];
  const blockedReason = ship.cooldown > 0 ? `On cooldown – ready in ${ship.cooldown}` : undefined;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>{cls.name}</Text>
        <Text style={styles.meta}>
          Mobility {mobility} · Cooldown after moving: {cooldownFor(ship)} turn{cooldownFor(ship) === 1 ? '' : 's'}
          {damageOf(ship) > 0 ? ` (includes ${damageOf(ship)} for damage)` : ''}
        </Text>
        {blockedReason ? <Text style={styles.blocked}>{blockedReason}</Text> : null}
      </View>
      {/* Kept directly under the header: at the bottom of the panel this fell
          below the fold on a 390x844 phone, so the preview could not be committed
          without scrolling. */}
      {pending ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button small variant="ghost" title="Cancel" onPress={onCancel} />
          </View>
          <View style={[styles.flex, { flex: 2 }]}>
            <Button small title={`Confirm: ${describeManeuver(pending)}`} onPress={onConfirm} />
          </View>
        </View>
      ) : null}
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((ctl) => {
            const d = ctl.maneuver.distance ?? 1;
            const hidden = (ctl.maneuver.kind === 'ahead' || ctl.maneuver.kind === 'astern') && d > mobility;
            if (hidden) return <View key={ctl.label} style={styles.flex} />;
            const ok = checkManeuver(ship, ctl.maneuver, fleet).ok;
            const active = sameManeuver(pending, ctl.maneuver);
            return (
              <View key={ctl.label} style={styles.flex}>
                <Button
                  small
                  variant={active ? 'primary' : 'secondary'}
                  title={ctl.label}
                  disabled={!ok}
                  onPress={() => onPick(ctl.maneuver)}
                />
              </View>
            );
          })}
        </View>
      ))}
      {pending ? null : (
        <Text style={styles.hint}>Turns pivot on the bow. Every move makes a splash on the enemy's screen.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.panelBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: { gap: 2 },
  title: { color: colors.text, fontWeight: '800', fontSize: 16 },
  meta: { color: colors.textDim, fontSize: 12 },
  blocked: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  hint: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
});
