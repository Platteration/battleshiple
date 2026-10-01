import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SHIP_CLASSES, Ship, damageOf, isReady, isSunk } from '../../engine';
import { makeStyles, radius, spacing, useTheme } from '../theme';

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
  const styles = useStyles();
  const { palette: p } = useTheme();
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
            accessibilityRole="button"
            accessibilityLabel={`${cls.name}, ${statusText(ship).toLowerCase()}`}
            accessibilityState={{ selected, disabled: !onSelect || sunk }}
            disabled={!onSelect || sunk}
            onPress={() => onSelect?.(ship)}
            style={[styles.card, compact && styles.chip, selected && styles.cardSelected, sunk && styles.cardSunk]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.swatch, { backgroundColor: sunk ? p.token.sunk : p.token.fill[ship.classId] }]} />
              <Text style={styles.name}>{cls.name}</Text>
            </View>
            <View style={[styles.segments, compact && styles.segmentsChip]}>
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
            {compact ? (
              // One line: the chip shows the exception (a cooldown, a wreck), not "Ready" five times.
              !ready ? <Text style={[styles.chipStatus, sunk && styles.statusSunk]}>{sunk ? 'Sunk' : `wait ${ship.cooldown}`}</Text> : null
            ) : (
              <Text style={[styles.status, ready && styles.statusReady, sunk && styles.statusSunk]}>{statusText(ship)}</Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  strip: { paddingHorizontal: spacing.sm, gap: spacing.sm },
  card: {
    backgroundColor: p.surface.raised,
    borderColor: p.surface.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    minWidth: 128,
  },
  // One line, about 40 pt tall instead of a 110 pt card.
  chip: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, minHeight: 40 },
  cardSelected: { borderColor: p.selected, borderWidth: 2 },
  cardSunk: { opacity: 0.5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  name: { ...ty.action, fontSize: 13, lineHeight: 17, color: p.ink.primary },
  segments: { flexDirection: 'row', gap: 3, marginTop: 6 },
  segmentsChip: { marginTop: 0, gap: 2 },
  chipStatus: { ...ty.label, color: p.ink.secondary },
  segment: { width: 12, height: 8, borderRadius: 2, backgroundColor: p.signal.success },
  segmentHit: { backgroundColor: p.pencil.hit },
  segmentSunk: { backgroundColor: p.token.sunk },
  meta: { ...ty.caption, fontSize: 11, lineHeight: 14, color: p.ink.secondary, marginTop: 6 },
  status: { ...ty.label, color: p.ink.secondary, marginTop: 4 },
  statusReady: { color: p.signal.success },
  statusSunk: { color: p.signal.danger },
}));
