/**
 * React Native's index exports most of itself through lazy getters: a module
 * is required, and with no Jest cache transformed, the first time a render
 * touches it. On a cold cache (every CI run) that cost, ~8 s for the app's
 * set, landed inside whichever suite's first `beforeEach` rendered a screen,
 * past the 5 s a hook gets. Touching the getters here pays it once per test
 * file, before any hook's clock starts; no test's budget changes.
 *
 * The list is what `src/` and `App.tsx` import from 'react-native'.
 */
import * as RN from 'react-native';

void [
  RN.AccessibilityInfo,
  RN.Alert,
  RN.Animated,
  RN.AppState,
  RN.Easing,
  RN.Linking,
  RN.Platform,
  RN.Pressable,
  RN.ScrollView,
  RN.StyleSheet,
  RN.Switch,
  RN.Text,
  RN.View,
  RN.useColorScheme,
  RN.useWindowDimensions,
];
