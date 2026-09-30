import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GameState, PlayerIndex, shipsRemaining } from '../../engine';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { makeStyles, radius, spacing } from '../theme';

interface Props {
  state: GameState;
  onRematch: () => void;
  onHome: () => void;
}

function stats(state: GameState, index: PlayerIndex) {
  const p = state.players[index];
  const hits = p.shots.filter((s) => s.result === 'hit').length;
  const moves = state.log.filter((e) => e.kind === 'move' && e.by === index).length;
  return { shots: p.shots.length, hits, moves, remaining: shipsRemaining(p.ships) };
}

export function GameOverScreen({ state, onRematch, onHome }: Props) {
  const styles = useStyles();
  const winner = state.winner ?? 0;
  const winnerName = state.players[winner].name;
  const humanWonVsAi = state.mode === 'ai' && !state.players[winner].isAI;
  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{state.mode === 'ai' ? (humanWonVsAi ? 'Victory' : 'Defeat') : 'Game over'}</Text>
        <Text style={styles.title}>{winnerName} wins!</Text>
        <Text style={styles.sub}>Turn {Math.floor(state.turn / 2) + 1}</Text>
      </View>
      <View style={styles.table}>
        <View style={styles.row}>
          <Text style={[styles.cell, styles.head]} />
          {state.players.map((p) => (
            <Text key={p.index} style={[styles.cell, styles.head]}>
              {p.name}
            </Text>
          ))}
        </View>
        {(['shots', 'hits', 'moves', 'remaining'] as const).map((k) => (
          <View key={k} style={styles.row}>
            <Text style={[styles.cell, styles.label]}>
              {k === 'shots' ? 'Shots fired' : k === 'hits' ? 'Hits' : k === 'moves' ? 'Manoeuvres' : 'Ships afloat'}
            </Text>
            {([0, 1] as const).map((i) => (
              <Text key={i} style={styles.cell}>
                {stats(state, i)[k]}
              </Text>
            ))}
          </View>
        ))}
      </View>
      <Button title="Rematch" onPress={onRematch} />
      <Button title="Main menu" variant="secondary" onPress={onHome} />
    </Screen>
  );
}

const useStyles = makeStyles(({ palette: p }) => ({
  hero: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  eyebrow: { color: p.ink.secondary, textTransform: 'uppercase', letterSpacing: 2 },
  title: { color: p.accent.text, fontSize: 32, fontWeight: '900' },
  sub: { color: p.ink.secondary },
  table: {
    backgroundColor: p.surface.raised,
    borderColor: p.surface.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row' },
  cell: { flex: 1, color: p.ink.primary, textAlign: 'center', fontSize: 15 },
  head: { color: p.accent.text, fontWeight: '800' },
  label: { textAlign: 'left', color: p.ink.secondary },
}));
