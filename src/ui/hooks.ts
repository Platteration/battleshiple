import { useWindowDimensions } from 'react-native';

/** Board width that fits the current screen with a little breathing room. */
export function useBoardWidth(max = 440): number {
  const { width } = useWindowDimensions();
  return Math.min(width - 24, max);
}
