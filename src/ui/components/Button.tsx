import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
  small?: boolean;
}

export function Button({ title, onPress, variant = 'primary', disabled, style, small }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        small && styles.small,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.text, variant === 'primary' && styles.textPrimary, small && styles.textSmall]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  small: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.panel, borderColor: colors.panelBorder },
  danger: { backgroundColor: colors.danger },
  ghost: { backgroundColor: 'transparent', borderColor: colors.panelBorder },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.35 },
  text: { color: colors.text, fontWeight: '700', fontSize: 16 },
  textPrimary: { color: colors.accentText },
  textSmall: { fontSize: 14 },
});
