import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { colors, spacing } from '../theme';

interface Props {
  playerName: string;
  message: string;
  onReady: () => void;
}

/** Blank screen shown between turns in pass-and-play so nobody peeks. */
export function HandoffScreen({ playerName, message, onReady }: Props) {
  return (
    <Screen scroll={false} style={styles.center}>
      <View style={styles.box}>
        <Text style={styles.eyebrow}>Pass the device to</Text>
        <Text style={styles.name}>{playerName}</Text>
        <Text style={styles.message}>{message}</Text>
        <Button title={`I'm ${playerName} – ready`} onPress={onReady} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center' },
  box: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  eyebrow: { color: colors.textDim, fontSize: 14, textTransform: 'uppercase', letterSpacing: 2 },
  name: { color: colors.accent, fontSize: 34, fontWeight: '900' },
  message: { color: colors.text, fontSize: 15, textAlign: 'center', marginBottom: spacing.md },
});
