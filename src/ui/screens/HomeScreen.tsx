import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Difficulty, FLEET, GameMode, SHIP_CLASSES } from '../../engine';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { colors, radius, shipColors, spacing } from '../theme';

interface Props {
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  onStart: (mode: GameMode) => void;
  /** Present when something went wrong and the player is owed an explanation. */
  notice?: string;
  /** Present when an unfinished game is on disk. */
  resume?: { label: string; onResume: () => void; onDiscard: () => void };
}

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

export function HomeScreen({ difficulty, onDifficultyChange, onStart, notice, resume }: Props) {
  const [showRules, setShowRules] = useState(false);
  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>BATTLESHIPLE</Text>
        <Text style={styles.subtitle}>Battleship, but the fleets won't sit still.</Text>
      </View>

      {notice && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}

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
                  <View style={[styles.swatch, { backgroundColor: shipColors[id] }]} />
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

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  title: { color: colors.accent, fontSize: 36, fontWeight: '900', letterSpacing: 4 },
  subtitle: { color: colors.textDim, fontSize: 15, textAlign: 'center' },
  resume: {
    backgroundColor: colors.panel,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  notice: {
    backgroundColor: colors.panel,
    borderColor: colors.panelBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  noticeText: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  resumeLabel: { color: colors.accent, fontWeight: '800', fontSize: 14 },
  resumeMeta: { color: colors.textDim, fontSize: 13 },
  blurb: { color: colors.textDim, fontSize: 13, marginTop: -spacing.xs },
  rules: {
    backgroundColor: colors.panel,
    borderColor: colors.panelBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  h2: { color: colors.accent, fontWeight: '800', fontSize: 15, marginTop: spacing.sm },
  p: { color: colors.text, fontSize: 14, lineHeight: 20 },
  table: { gap: 4, marginTop: spacing.xs },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  cell: { color: colors.textDim, fontSize: 12, flex: 1 },
  cellName: { color: colors.text, fontWeight: '700', flex: 1.4 },
});
