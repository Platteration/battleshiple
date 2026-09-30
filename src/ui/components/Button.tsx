import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { makeStyles, radius, spacing } from '../theme';

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
  const styles = useStyles();
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

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
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
  primary: { backgroundColor: p.accent.fill },
  secondary: { backgroundColor: p.surface.raised, borderColor: p.surface.border },
  danger: { backgroundColor: p.signal.danger },
  ghost: { backgroundColor: 'transparent', borderColor: p.surface.border },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.35 },
  text: { ...ty.action, color: p.ink.primary },
  textPrimary: { color: p.ink.onAccent },
  textSmall: { fontSize: 14, lineHeight: 18 },
}));
