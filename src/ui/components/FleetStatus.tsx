import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SHIP_CLASSES, Ship, damageOf, isReady, isSunk } from '../../engine';
import { colors, radius, shipColors, spacing } from '../theme';

interface Props {
  ships: readonly Ship[];
  selectedId?: string;
  onSelect?: (ship: Ship) => void;
  compact?: boolean;
}

function statusText(ship: Ship): string {
  if (isSunk(ship)) return 'Sunk';
  if (ship.cooldown > 0) return `Ready in ${ship.cooldown}`;
  return 'Ready';
}

/** Horizontal strip of ship cards showing damage, cooldown and mobility. */
export function FleetStatus({ ships, selectedId, onSelect, compact }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {ships.map((ship) => {
        const cls = SHIP_CLASSES[ship.classId];
        const sunk = isSunk(ship);
        const ready = isReady(ship);
        const selected = ship.id === selectedId;
        return (
          <Pressable
            key={ship.id}
            disabled={!onSelect || sunk}
            onPress={() => onSelect?.(ship)}
            style={[styles.card, selected && styles.cardSelected, sunk && styles.cardSunk, compact && styles.cardCompact]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.swatch, { backgroundColor: sunk ? colors.sunk : shipColors[ship.classId] }]} />
              <Text style={styles.name}>{cls.name}</Text>
            </View>
            <View style={styles.segments}>
              {ship.hits.map((hit, i) => (
                <View key={i} style={[styles.segment, hit && styles.segmentHit, sunk && styles.segmentSunk]} />
              ))}
            </View>
            {!compact && (
              <Text style={styles.meta}>
                Mobility {cls.mobility} · Cooldown {cls.cooldown}
                {damageOf(ship) > 0 && !sunk ? `+${damageOf(ship)}` : ''}
              </Text>
            )}
            <Text style={[styles.status, ready && styles.statusReady, sunk && styles.statusSunk]}>{statusText(ship)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { paddingHorizontal: spacing.sm, gap: spacing.sm },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.panelBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    minWidth: 128,
  },
  cardCompact: { minWidth: 100 },
  cardSelected: { borderColor: colors.selected, borderWidth: 2 },
  cardSunk: { opacity: 0.5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  name: { color: colors.text, fontWeight: '700', fontSize: 13 },
  segments: { flexDirection: 'row', gap: 3, marginTop: 6 },
  segment: { width: 12, height: 8, borderRadius: 2, backgroundColor: colors.success },
  segmentHit: { backgroundColor: colors.hit },
  segmentSunk: { backgroundColor: colors.sunk },
  meta: { color: colors.textDim, fontSize: 11, marginTop: 6 },
  status: { color: colors.textDim, fontSize: 12, marginTop: 4, fontWeight: '600' },
  statusReady: { color: colors.success },
  statusSunk: { color: colors.danger },
});
