import React from 'react';
import { Text, View } from 'react-native';
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

/**
 * The human player in vs-Computer mode is literally named "You", which made the
 * plain template read "You wins!".
 */
export function winLine(name: string): string {
  return name === 'You' ? 'You win!' : `${name} wins!`;
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
        <Text style={styles.title}>{winLine(winnerName)}</Text>
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

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  hero: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  eyebrow: { ...ty.label, color: p.ink.secondary },
  title: { ...ty.display, color: p.accent.text, textAlign: 'center' },
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
  cell: { ...ty.body, flex: 1, color: p.ink.primary, textAlign: 'center' },
  head: { ...ty.label, color: p.accent.text },
  label: { textAlign: 'left', color: p.ink.secondary },
}));
