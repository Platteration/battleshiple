import Constants from 'expo-constants';
import React from 'react';
import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { APP_NAME, LICENCE, PRIVACY, SOURCE_URL, TAGLINE, appVersion } from '../../about';
import { confirmAction } from '../../confirm';
import { ReduceMotionSetting, useSettings } from '../../settings';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { colors, radius, spacing } from '../theme';

/** The rows, in order, as the contract test pins them. */
export const SETTINGS_ROWS = ['Vibration', 'Reduce motion', 'Reset to defaults', 'About'] as const;

const MOTION: { value: ReduceMotionSetting; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

interface Props {
  onBack: () => void;
}

export function SettingsScreen({ onBack }: Props) {
  const { settings, update, reset } = useSettings();

  const onReset = () =>
    // Confirmed because a reset cannot be undone from inside the app; it
    // touches the settings record alone, so the saved battle is not at stake.
    confirmAction({
      title: 'Reset settings?',
      message: 'Vibration, motion and computer skill go back to how they started. An unfinished battle is kept.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Reset',
      onConfirm: reset,
    });

  return (
    <Screen>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Vibration</Text>
            <Text style={styles.hint}>A buzz for shots, hits and manoeuvres.</Text>
          </View>
          <Switch
            accessibilityLabel="Vibration"
            value={settings.haptics}
            onValueChange={(on) => update({ haptics: on })}
            trackColor={{ false: colors.panelBorder, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Segmented label="Reduce motion" options={MOTION} value={settings.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
        <Text style={styles.hint}>Holds the splash ripples still. System follows the device's accessibility setting.</Text>
      </View>

      <Button title="Reset to defaults" variant="ghost" onPress={onReset} />

      <View style={styles.card}>
        <Text style={styles.h2}>About</Text>
        <Text style={styles.p}>
          {APP_NAME} {appVersion(Constants.expoConfig?.version)}
        </Text>
        <Text style={styles.p}>{TAGLINE}</Text>
        <Text
          accessibilityRole="link"
          // Handed to the browser; a device with nothing to open it rejects, which is nothing to us.
          onPress={() => void Linking.openURL(SOURCE_URL).catch(() => undefined)}
          style={styles.link}
        >
          {LICENCE} · source
        </Text>
        <Text style={styles.p}>{PRIVACY}</Text>
      </View>

      <Button title="Back to menu" variant="secondary" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.accent, fontSize: 28, fontWeight: '900', letterSpacing: 2, paddingVertical: spacing.sm },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.panelBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  label: { color: colors.text, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  h2: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  p: { color: colors.text, fontSize: 14, lineHeight: 20 },
  link: { color: colors.accent, fontSize: 14, lineHeight: 20, textDecorationLine: 'underline' },
});
