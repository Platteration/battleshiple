import type { Difficulty } from '../engine';

/**
 * The computer opponent at each skill: a fictional commander (no real navy, no
 * nationality) and a line saying how they play. The lines are the ones the
 * menu always showed; the names replace "Admiral Byte". Free of React, so the
 * menu, App and tests all read the one table.
 */
export interface Opponent {
  name: string;
  blurb: string;
}

export const OPPONENTS: Record<Difficulty, Opponent> = {
  easy: { name: 'Cdr. Hollis', blurb: 'Fires loosely and rarely repositions.' },
  normal: { name: 'Capt. Varga', blurb: 'Hunts methodically and chases hits.' },
  hard: { name: 'The Heron', blurb: 'Reads your splashes to hunt the quadrant you moved into.' },
};
