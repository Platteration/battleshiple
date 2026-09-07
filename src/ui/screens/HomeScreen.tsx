import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FLEET, SHIP_CLASSES, GameMode } from '../../engine';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { colors, radius, shipColors, spacing } from '../theme';

interface Props {
  onStart: (mode: GameMode) => void;
}

export function HomeScreen({ onStart }: Props) {
  const [showRules, setShowRules] = useState(false);
  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>BATTLESHIPLE</Text>
        <Text style={styles.subtitle}>Battleship, but the fleets won't sit still.</Text>
      </View>

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
            there, but not what or exactly where.
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
          <Text style={styles.p}>Sink every enemy ship. Old shot markers fade – a miss yesterday can be a hit today.</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  title: { color: colors.accent, fontSize: 36, fontWeight: '900', letterSpacing: 4 },
  subtitle: { color: colors.textDim, fontSize: 15, textAlign: 'center' },
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
