import React, { useState, useSyncExternalStore } from 'react';
import { Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onStorageRefusedChange, storageRefused } from '../../storage';
import { BottomReserve } from '../layout';
import { makeStyles, spacing } from '../theme';

/** What the note says in a browser, which keeps its storage per site... */
export const STORAGE_REFUSED_WEB =
  'This browser is not saving the game: its storage for this site is full or switched off, so the battle and your settings are lost if the page is closed. Saving resumes by itself once there is room.';
/** ...and on a phone, where the store only refuses when the disk is full. */
export const STORAGE_REFUSED_NATIVE =
  'This device is not saving the game: its storage is full, so the battle and your settings are lost if the app is closed. Saving resumes by itself once there is room.';

/**
 * The screens, with a note across the bottom of the window while the store
 * refuses to save (`storageRefused` in src/storage.ts). On the shared GitHub
 * Pages address another app can fill the storage this one writes to, and a
 * battle that silently stops saving is gone on the next reload. Outside the
 * screens, so it stays put as they change, and gone again once a write gets
 * through. Its height, the bottom inset included, is the `BottomReserve` every
 * screen pads by and the game board is sized from, so it never covers the
 * action bar or the board.
 */
export function StorageNoteFrame({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const refused = useSyncExternalStore(onStorageRefusedChange, storageRefused, storageRefused);
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  return (
    <View style={styles.fill}>
      <BottomReserve.Provider value={refused ? height : 0}>{children}</BottomReserve.Provider>
      {refused && (
        <View
          testID="storage-note"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[
            styles.note,
            {
              paddingBottom: insets.bottom + spacing.sm,
              paddingLeft: insets.left + spacing.md,
              paddingRight: insets.right + spacing.md,
            },
          ]}
          onLayout={(e) => setHeight(Math.ceil(e.nativeEvent.layout.height))}
        >
          <Text style={styles.text}>{Platform.OS === 'web' ? STORAGE_REFUSED_WEB : STORAGE_REFUSED_NATIVE}</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ palette: p, type: ty }) => ({
  fill: { flex: 1 },
  note: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.sm,
    backgroundColor: p.surface.raised,
    borderTopWidth: 1,
    borderTopColor: p.surface.border,
  },
  text: { ...ty.caption, color: p.ink.primary },
}));
