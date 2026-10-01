import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Maneuver, SHIP_CLASSES, Ship, checkManeuver, cooldownFor, damageOf, mobilityOf } from '../../engine';
import { makeStyles, radius, spacing } from '../theme';

interface Props {
  ship?: Ship;
  fleet: readonly Ship[];
  /** Manoeuvre currently previewed on the board, awaiting confirmation in the action bar. */
  pending: Maneuver | null;
  onPick: (m: Maneuver) => void;
  /**
   * A short screen: one row of eight glyphs instead of two rows of four
   * labelled controls. Each keeps its full name as its accessibility label, and
   * the action bar spells out a picked manoeuvre ("Confirm: ahead 2").
   */
  compact?: boolean;
}

interface Control {
  glyph: string;
  label: string;
  maneuver: Maneuver;
}

/** The helm, two rows of four: movement along the hull, then across it and turning. */
const ROWS: Control[][] = [
  [
    { glyph: '▲', label: 'Ahead 1', maneuver: { kind: 'ahead', distance: 1 } },
    { glyph: '▲▲', label: 'Ahead 2', maneuver: { kind: 'ahead', distance: 2 } },
    { glyph: '▼', label: 'Astern 1', maneuver: { kind: 'astern', distance: 1 } },
    { glyph: '▼▼', label: 'Astern 2', maneuver: { kind: 'astern', distance: 2 } },
  ],
  [
    { glyph: '◀', label: 'Port', maneuver: { kind: 'port' } },
    { glyph: '▶', label: 'Starboard', maneuver: { kind: 'starboard' } },
    { glyph: '↺', label: 'Turn CCW', maneuver: { kind: 'rotateCCW' } },
    { glyph: '↻', label: 'Turn CW', maneuver: { kind: 'rotateCW' } },
  ],
];

function sameManeuver(a: Maneuver | null, b: Maneuver): boolean {
  return !!a && a.kind === b.kind && (a.distance ?? 1) === (b.distance ?? 1);
}

/** Every manoeuvre kind: tap once to preview it on the board, then confirm in the action bar. */
export function ManeuverPanel({ ship, fleet, pending, onPick, compact }: Props) {
  const styles = useStyles();
  if (!ship) {
    return (
      <View style={styles.panel}>
        <Text style={styles.hint}>Tap one of your ships to manoeuvre it, or hold position.</Text>
      </View>
    );
  }
  const cls = SHIP_CLASSES[ship.classId];
  const mobility = mobilityOf(ship);
  const cooldown = cooldownFor(ship);
  const damage = damageOf(ship);

  return (
    <View style={styles.panel}>
      <Text style={styles.meta} numberOfLines={1}>
        <Text style={styles.name}>{cls.name}</Text>
        {` · moves ${mobility} · cooldown ${cooldown}${damage > 0 ? ` (+${damage} damage)` : ''}`}
      </Text>
      {ship.cooldown > 0 ? <Text style={styles.blocked}>On cooldown – ready in {ship.cooldown}</Text> : null}
      {(compact ? [ROWS.flat()] : ROWS).map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((ctl) => {
            const d = ctl.maneuver.distance ?? 1;
            // A distance beyond this hull's mobility keeps its slot, so the grid never jumps.
            if ((ctl.maneuver.kind === 'ahead' || ctl.maneuver.kind === 'astern') && d > mobility) {
              return <View key={ctl.label} style={styles.slot} />;
            }
            const ok = checkManeuver(ship, ctl.maneuver, fleet).ok;
            const active = sameManeuver(pending, ctl.maneuver);
            return (
              <Pressable
                key={ctl.label}
                accessibilityRole="button"
                accessibilityLabel={ctl.label}
                accessibilityState={{ disabled: !ok, selected: active }}
                disabled={!ok}
                onPress={() => onPick(ctl.maneuver)}
                style={({ pressed }) => [
                  styles.slot,
                  styles.control,
                  active && styles.controlActive,
                  pressed && ok && styles.pressed,
                  !ok && styles.disabled,
                ]}
              >
                <Text style={[styles.glyph, compact && styles.glyphOnly, active && styles.textActive]}>{ctl.glyph}</Text>
                {compact ? null : (
                  <Text style={[styles.label, active && styles.textActive]} numberOfLines={1}>
                    {ctl.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  panel: {
    backgroundColor: p.surface.raised,
    borderColor: p.surface.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 6,
  },
  meta: { ...ty.caption, color: p.ink.secondary },
  name: { ...ty.action, fontSize: 14, lineHeight: 18, color: p.ink.primary },
  blocked: { ...ty.label, color: p.signal.danger },
  row: { flexDirection: 'row', gap: 4 },
  slot: { flex: 1, minHeight: 44 },
  control: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: p.surface.border,
    backgroundColor: p.surface.base,
  },
  controlActive: { backgroundColor: p.accent.fill, borderColor: p.accent.fill },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.35 },
  glyph: { ...ty.action, fontSize: 13, lineHeight: 16, color: p.ink.primary },
  glyphOnly: { fontSize: 15, lineHeight: 20 },
  label: { ...ty.caption, fontSize: 12, lineHeight: 16, fontWeight: '700', color: p.ink.primary },
  textActive: { color: p.ink.onAccent },
  hint: { ...ty.caption, color: p.ink.secondary, textAlign: 'center' },
}));
