import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Difficulty, FLEET, GameMode, SHIP_CLASSES } from '../../engine';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { Appearance, makeStyles, radius, spacing, useTheme } from '../theme';

interface Props {
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
  onStart: (mode: GameMode) => void;
  /** Present when an unfinished game is on disk. */
  resume?: { label: string; onResume: () => void; onDiscard: () => void };
}

const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
];

const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: 'Fires loosely and rarely repositions.',
  normal: 'Hunts methodically and chases hits.',
  hard: 'Reads your splashes to hunt the quadrant you moved into.',
};

export function HomeScreen({ difficulty, onDifficultyChange, onStart, resume, appearance, onAppearanceChange }: Props) {
  const styles = useStyles();
  const { palette: p } = useTheme();
  const [showRules, setShowRules] = useState(false);
  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>BATTLESHIPLE</Text>
        <Text style={styles.subtitle}>Battleship, but the fleets won't sit still.</Text>
      </View>

      {resume && (
        <View style={styles.resume}>
          <Text style={styles.resumeLabel}>Unfinished battle</Text>
          <Text style={styles.resumeMeta}>{resume.label}</Text>
          <Button title="Resume game" onPress={resume.onResume} />
          <Button title="Discard" variant="ghost" small onPress={resume.onDiscard} />
        </View>
      )}

      <Segmented label="Computer skill" options={DIFFICULTIES} value={difficulty} onChange={onDifficultyChange} />
      <Text style={styles.blurb}>{DIFFICULTY_BLURB[difficulty]}</Text>

      <Button title="Play vs Computer" onPress={() => onStart('ai')} />
      <Button title="Pass & Play (2 players)" variant="secondary" onPress={() => onStart('local')} />
      <Button title={showRules ? 'Hide rules' : 'How to play'} variant="ghost" onPress={() => setShowRules((v) => !v)} />

      <Segmented label="Appearance" options={APPEARANCES} value={appearance} onChange={onAppearanceChange} />

      {showRules && (
        <View style={styles.rules}>
          <Text style={styles.h2}>Every turn</Text>
          <Text style={styles.p}>1. Fire one shot into enemy waters.</Text>
          <Text style={styles.p}>
            2. Optionally manoeuvre ONE ship: steam ahead or astern up to its mobility, shift one cell to port or
            starboard, or turn 90° pivoting on the bow.
          </Text>
          <Text style={styles.p}>3. End your turn. Damage stays on a ship even when it moves.</Text>

          <Text style={styles.h2}>Splashes</Text>
          <Text style={styles.p}>
            Whenever a ship moves, the enemy sees a splash in the quadrant where it ended up. They know something moved
            there, but not what or exactly where. Moving is how you survive, and it is also how you give yourself away.
          </Text>

          <Text style={styles.h2}>Cooldowns & mobility</Text>
          <Text style={styles.p}>
            After manoeuvring, a ship must sit out a number of your turns. Bigger hulls are slower, and every point of
            damage adds a turn to the cooldown. Sunk ships never move.
          </Text>
          <View style={styles.table}>
            {FLEET.map((id) => {
              const cls = SHIP_CLASSES[id];
              return (
                <View key={id} style={styles.tableRow}>
                  <View style={[styles.swatch, { backgroundColor: p.token.fill[id] }]} />
                  <Text style={[styles.cell, styles.cellName]}>{cls.name}</Text>
                  <Text style={styles.cell}>Size {cls.length}</Text>
                  <Text style={styles.cell}>Moves {cls.mobility}</Text>
                  <Text style={styles.cell}>Cooldown {cls.cooldown}</Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.h2}>Winning</Text>
          <Text style={styles.p}>
            Sink every enemy ship. Old shot markers fade – a miss yesterday can be a hit today. A wounded ship that sits
            still is a dead ship.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  hero: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  title: { ...ty.display, color: p.accent.text },
  subtitle: { ...ty.body, color: p.ink.secondary, textAlign: 'center' },
  resume: {
    backgroundColor: p.surface.raised,
    borderColor: p.accent.fill,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  resumeLabel: { ...ty.label, color: p.accent.text },
  resumeMeta: { ...ty.caption, color: p.ink.secondary },
  blurb: { ...ty.caption, color: p.ink.secondary, marginTop: -spacing.xs },
  rules: {
    backgroundColor: p.surface.raised,
    borderColor: p.surface.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  h2: { ...ty.title, fontSize: 18, lineHeight: 24, color: p.accent.text, marginTop: spacing.sm },
  p: { ...ty.body, color: p.ink.primary },
  table: { gap: 4, marginTop: spacing.xs },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  cell: { ...ty.caption, fontSize: 12, lineHeight: 16, color: p.ink.secondary, flex: 1 },
  cellName: { ...ty.action, fontSize: 12, lineHeight: 16, color: p.ink.primary, flex: 1.4 },
}));
