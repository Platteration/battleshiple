import { ShipClass, ShipClassId } from './types';

export const BOARD_SIZE = 10;

/**
 * Fleet roster. Smaller hulls are nimbler: shorter cooldown and more mobility.
 * Every point of damage a ship carries adds one extra turn to its cooldown.
 */
export const SHIP_CLASSES: Record<ShipClassId, ShipClass> = {
  carrier: { id: 'carrier', name: 'Carrier', length: 5, cooldown: 4, mobility: 1 },
  battleship: { id: 'battleship', name: 'Battleship', length: 4, cooldown: 3, mobility: 2 },
  destroyer: { id: 'destroyer', name: 'Destroyer', length: 3, cooldown: 2, mobility: 2 },
  submarine: { id: 'submarine', name: 'Submarine', length: 3, cooldown: 2, mobility: 2 },
  patrol: { id: 'patrol', name: 'Patrol Boat', length: 2, cooldown: 1, mobility: 2 },
};

export const FLEET: ShipClassId[] = ['carrier', 'battleship', 'destroyer', 'submarine', 'patrol'];

/**
 * How many of the observing player's own turns a splash stays visible.
 *
 * Expressed in whole observer turns on purpose. Expiry is only ever evaluated at
 * the observer's own endTurn, i.e. at even splash ages, so a knob counting raw
 * half-turns would have had two values for every distinct behaviour and half of
 * them would have done nothing.
 */
export const SPLASH_VISIBLE_TURNS = 1;
