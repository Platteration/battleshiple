import Constants from 'expo-constants';
import React, { useState } from 'react';
import { Linking, Platform, Switch, Text, View } from 'react-native';
import { APP_NAME, LICENCE, PRIVACY, PRIVACY_WITH_ACCOUNT, SOURCE_URL, SUPPORTER_THANKS, TAGLINE, appVersion } from '../../about';
import { useAccount } from '../../account';
import { ACCOUNT_NOTES, WORDS, formatPrice } from '../../accountModel';
import { confirmAction } from '../../confirm';
import { ReduceMotionSetting, ThemeSetting, useSettings } from '../../settings';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { makeStyles, radius, spacing, useTheme } from '../theme';

/**
 * What the Vibration row says in a browser. src/ui/feedback.ts sends nothing to the haptics
 * engine on the web, so there the switch would change a stored value and nothing else: it is
 * drawn off and cannot be pressed, and the hint says where vibration is. The stored choice is
 * left alone for the phone app.
 */
export const WEB_VIBRATION_HINT = 'A browser cannot vibrate for the game; vibration is in the iOS and Android apps.';

/**
 * The rows, in order, as the contract test pins them. On a website whose api/ offers sign-in
 * (server/kit), an Account card and, when the site sells it, a "Support this app" card come
 * between Reset to defaults and About; a phone, and a site without the api/, never draws them.
 */
export const SETTINGS_ROWS = ['Theme', 'Vibration', 'Reduce motion', 'Reset to defaults', 'About'] as const;

const THEMES: { value: ThemeSetting; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

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
  const account = useAccount();
  const styles = useStyles();
  const { palette: p } = useTheme();
  const web = Platform.OS === 'web';
  /** What the Account card says when signing out or deleting did not work. */
  const [accountNote, setAccountNote] = useState<string | null>(null);
  /** ...and what the shop card says when Buy did not leave for Checkout. */
  const [shopNote, setShopNote] = useState<string | null>(null);
  const product = account.supporter;
  const price = product?.price ? formatPrice(product.price) : null;

  const onReset = () =>
    // Confirmed because a reset cannot be undone from inside the app; it
    // touches the settings record alone, so the saved battle is not at stake.
    confirmAction({
      title: 'Reset settings?',
      message: 'Theme, vibration, motion and computer skill go back to how they started. An unfinished battle is kept.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Reset',
      onConfirm: reset,
    });

  const onDeleteAccount = () =>
    // Confirmed because the account and the record of the payment cannot be brought back from
    // here. The payment itself stays with Stripe, with the account id it was made under.
    confirmAction({
      title: ACCOUNT_NOTES.deleteTitle,
      message: ACCOUNT_NOTES.deleteBody,
      cancelLabel: ACCOUNT_NOTES.deleteCancel,
      confirmLabel: ACCOUNT_NOTES.deleteConfirm,
      onConfirm: () => void account.deleteAccount().then(setAccountNote),
    });

  return (
    <Screen>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Segmented label="Theme" options={THEMES} value={settings.theme} onChange={(v) => update({ theme: v })} />
        <Text style={styles.hint}>Warm ivory or deep ink. System follows the device.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Vibration</Text>
            <Text style={styles.hint}>{web ? WEB_VIBRATION_HINT : 'A buzz for shots, hits and manoeuvres.'}</Text>
          </View>
          <Switch
            accessibilityLabel="Vibration"
            value={web ? false : settings.haptics}
            disabled={web}
            onValueChange={(on) => update({ haptics: on })}
            trackColor={{ false: p.control.trackOff, true: p.control.trackOn }}
            thumbColor={p.control.thumb}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Segmented label="Reduce motion" options={MOTION} value={settings.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
        <Text style={styles.hint}>Skips the splash ripple; the reported quadrant stays marked. System follows the device's accessibility setting.</Text>
      </View>

      <Button title="Reset to defaults" variant="ghost" onPress={onReset} />

      {account.signInOn && (
        <View style={styles.card}>
          <Text style={styles.h2}>{WORDS.section}</Text>
          {account.user ? (
            <>
              <Text style={styles.p}>{account.user.email ? WORDS.signedInAs(account.user.email) : WORDS.signedIn}</Text>
              <Button title={WORDS.signOut} variant="secondary" onPress={() => void account.signOut().then(setAccountNote)} />
              <Button title={WORDS.deleteAccount} variant="ghost" onPress={onDeleteAccount} />
            </>
          ) : (
            <Button title={WORDS.signIn} variant="secondary" onPress={account.signIn} />
          )}
          {accountNote && <Text style={styles.hint}>{accountNote}</Text>}
        </View>
      )}

      {product && (
        <View style={styles.card}>
          <Text style={styles.h2}>{product.name}</Text>
          <Text style={styles.p}>{product.description}</Text>
          {price && <Text style={styles.label}>{price}</Text>}
          {account.supported ? (
            <Text style={styles.label}>{WORDS.owned}</Text>
          ) : account.user ? (
            <Button title={WORDS.buy} onPress={() => void account.buySupport().then(setShopNote)} />
          ) : (
            <Button title={WORDS.signInToBuy} variant="secondary" onPress={account.signIn} />
          )}
          {shopNote && <Text style={styles.hint}>{shopNote}</Text>}
        </View>
      )}

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
        <Text style={styles.p}>{account.signInOn ? PRIVACY_WITH_ACCOUNT : PRIVACY}</Text>
        {account.supported && <Text style={styles.p}>{SUPPORTER_THANKS}</Text>}
      </View>

      <Button title="Back to menu" variant="secondary" onPress={onBack} />
    </Screen>
  );
}

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  title: { ...ty.title, fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: 2, color: p.accent.text, paddingVertical: spacing.sm },
  card: {
    backgroundColor: p.surface.raised,
    borderColor: p.surface.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  label: { ...ty.heading, fontSize: 16, color: p.ink.primary },
  hint: { ...ty.caption, color: p.ink.secondary },
  h2: { ...ty.label, color: p.accent.text },
  p: { ...ty.body, fontSize: 14, lineHeight: 20, color: p.ink.primary },
  link: { ...ty.body, fontSize: 14, lineHeight: 20, color: p.accent.text, textDecorationLine: 'underline' },
}));
