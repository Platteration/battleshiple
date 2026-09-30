import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { makeStyles, spacing } from '../theme';

interface Props {
  playerName: string;
  message: string;
  onReady: () => void;
}

/** Blank screen shown between turns in pass-and-play so nobody peeks. */
export function HandoffScreen({ playerName, message, onReady }: Props) {
  const styles = useStyles();
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

const useStyles = makeStyles(({ palette: p }) => ({
  center: { justifyContent: 'center' },
  box: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  eyebrow: { color: p.ink.secondary, fontSize: 14, textTransform: 'uppercase', letterSpacing: 2 },
  name: { color: p.accent.text, fontSize: 34, fontWeight: '900' },
  message: { color: p.ink.primary, fontSize: 15, textAlign: 'center', marginBottom: spacing.md },
}));
