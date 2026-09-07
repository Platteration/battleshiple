import React from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}

/** Full-screen dark background that respects notches and home indicators. */
export function Screen({ children, scroll = true, style }: Props) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + spacing.sm,
    paddingBottom: insets.bottom + spacing.lg,
    paddingLeft: insets.left + spacing.md,
    paddingRight: insets.right + spacing.md,
  };
  if (!scroll) {
    return <View style={[styles.root, padding, style]}>{children}</View>;
  }
  return (
    <ScrollView style={styles.root} contentContainerStyle={[padding, styles.content, style]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { gap: spacing.md },
});
