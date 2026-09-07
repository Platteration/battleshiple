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

/** Number of half-turns a splash stays visible to the observing player. */
export const SPLASH_TTL = 2;
