import React from 'react';
import { Text, View } from 'react-native';
import { useAccount } from '../../account';
import { WORDS } from '../../accountModel';
import { makeStyles, radius, spacing } from '../theme';
import { Button } from './Button';

/**
 * The website's one line about the account, on the menu, which is where Google and Stripe send
 * the visitor back to: a sign-in that did not complete, a payment that has arrived, or one still
 * on its way. Drawn only while there is one, which on a phone, and on a site without the api/,
 * is never.
 */
export function AccountNotice() {
  const styles = useStyles();
  const { notice, dismissNotice } = useAccount();
  if (!notice) return null;
  return (
    <View style={styles.notice} accessibilityRole="alert">
      <Text style={styles.text}>{notice}</Text>
      <Button title={WORDS.dismiss} variant="ghost" small onPress={dismissNotice} />
    </View>
  );
}

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  notice: {
    backgroundColor: p.surface.raised,
    borderColor: p.surface.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  text: { ...ty.body, color: p.ink.primary },
}));
