import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { makeStyles, radius, spacing } from '../theme';

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
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Pass the device to</Text>
        <Text style={styles.name}>{playerName}</Text>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.hidden}>The board stays covered until you tap below.</Text>
        <Button title={`I'm ${playerName} – ready`} onPress={onReady} />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  center: { justifyContent: 'center' },
  // A plain card on the table: nothing of either fleet behind it.
  card: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: p.surface.raised,
    borderColor: p.surface.border,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  hidden: { ...ty.caption, color: p.ink.secondary, textAlign: 'center' },
  eyebrow: { ...ty.label, fontSize: 14, color: p.ink.secondary },
  name: { ...ty.display, color: p.accent.text },
  message: { ...ty.body, color: p.ink.primary, textAlign: 'center' },
}));
