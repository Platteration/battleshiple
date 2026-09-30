import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { makeStyles, radius } from '../theme';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}

export function Segmented<T extends string>({ options, value, onChange, label }: Props<T>) {
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.bar}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(opt.value)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.text, active && styles.textActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ palette: p }) => ({
  wrap: { gap: 6 },
  label: { color: p.ink.secondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  bar: { flexDirection: 'row', backgroundColor: p.surface.raised, borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: p.accent.fill },
  text: { color: p.ink.secondary, fontWeight: '700', fontSize: 14 },
  textActive: { color: p.ink.onAccent },
}));
