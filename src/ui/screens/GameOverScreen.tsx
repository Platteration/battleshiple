import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { AfterActionReport, SideReport } from '../../engine';
import { emptyGrid, hullsOf, paintShips } from '../boardView';
import { Button } from '../components/Button';
import { MiniPlot } from '../components/MiniPlot';
import { Screen } from '../components/Screen';
import { makeStyles, radius, spacing } from '../theme';

interface Props {
  /**
   * The finished battle, from afterActionReport, never the GameState: the
   * report is the one projection that may show both fleets, and it refuses to
   * exist until the battle is over.
   */
  report: AfterActionReport;
  onRematch: () => void;
  onHome: () => void;
}

/**
 * The human player in vs-Computer mode is literally named "You", which made the
 * plain template read "You wins!".
 */
export function winLine(name: string): string {
  return name === 'You' ? 'You win!' : `${name} wins!`;
}

const ROWS: { label: string; value: (s: SideReport) => string }[] = [
  { label: 'Shots fired', value: (s) => String(s.shots) },
  { label: 'Hits', value: (s) => String(s.hits) },
  { label: 'Hit rate', value: (s) => `${Math.round(s.hitRate * 100)}%` },
  { label: 'Manoeuvres', value: (s) => String(s.manoeuvres) },
  { label: 'Ships afloat', value: (s) => String(s.afloat) },
];

/** One fleet where it finished: wrecks in the wreck colour, damage marked. */
function FinalPlot({ side, size }: { side: SideReport; size: number }) {
  const styles = useStyles();
  const grid = useMemo(() => {
    const g = emptyGrid();
    paintShips(g, side.fleet);
    return g;
  }, [side]);
  const hulls = useMemo(() => hullsOf(side.fleet), [side]);
  return (
    <View style={styles.plotCol}>
      <MiniPlot grid={grid} hulls={hulls} size={size} label={`${side.name}'s fleet at the end`} />
      <Text style={styles.plotName} numberOfLines={1}>
        {side.name}
      </Text>
    </View>
  );
}

export function GameOverScreen({ report, onRematch, onHome }: Props) {
  const styles = useStyles();
  const winner = report.sides[report.winner];
  const humanWonVsAi = report.mode === 'ai' && !winner.isAI;
  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{report.mode === 'ai' ? (humanWonVsAi ? 'Victory' : 'Defeat') : 'Game over'}</Text>
        <Text style={styles.title}>{winLine(winner.name)}</Text>
        <Text style={styles.sub}>
          After {report.turns} turn{report.turns === 1 ? '' : 's'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>After-action report</Text>
        <View style={styles.row}>
          <Text style={[styles.cell, styles.head]} />
          {report.sides.map((s) => (
            <Text key={s.index} style={[styles.cell, styles.head]} numberOfLines={1}>
              {s.name}
            </Text>
          ))}
        </View>
        {ROWS.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={[styles.cell, styles.label]}>{row.label}</Text>
            {report.sides.map((s) => (
              <Text key={s.index} style={styles.cell}>
                {row.value(s)}
              </Text>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Final positions</Text>
        <Text style={styles.note}>Every hull where it finished, now there is nothing left to hide.</Text>
        <View style={styles.plots}>
          {report.sides.map((s) => (
            <FinalPlot key={s.index} side={s} size={132} />
          ))}
        </View>
      </View>

      <Button title="Rematch" onPress={onRematch} />
      <Button title="Main menu" variant="secondary" onPress={onHome} />
    </Screen>
  );
}

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  hero: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.xs },
  eyebrow: { ...ty.label, color: p.ink.secondary },
  title: { ...ty.display, color: p.accent.text, textAlign: 'center' },
  sub: { ...ty.body, color: p.ink.secondary },
  card: {
    backgroundColor: p.surface.raised,
    borderColor: p.surface.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { ...ty.label, color: p.accent.text },
  note: { ...ty.caption, color: p.ink.secondary },
  row: { flexDirection: 'row' },
  cell: { ...ty.body, flex: 1, color: p.ink.primary, textAlign: 'center' },
  head: { ...ty.action, fontSize: 14, color: p.ink.primary },
  label: { textAlign: 'left', color: p.ink.secondary },
  plots: { flexDirection: 'row', justifyContent: 'space-around', gap: spacing.md },
  plotCol: { alignItems: 'center', gap: spacing.xs },
  plotName: { ...ty.caption, color: p.ink.secondary, maxWidth: 132 },
}));
