import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Button } from './Button';
import { Screen } from './Screen';

interface Props {
  children: React.ReactNode;
  /** Take the app back to the menu. The boundary clears its own error first. */
  onReset: () => void;
}

interface State {
  failed: boolean;
}

/**
 * A throw during render unmounts the whole React tree, which on a phone means
 * the app simply disappears. A saved game is the one input this app does not
 * author itself, so rather than let a bad one take the process with it, the
 * failure is caught and turned into a way back to the menu.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  private handleReset = () => {
    this.setState({ failed: false });
    this.props.onReset();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Screen scroll={false} style={styles.center}>
        <View style={styles.box}>
          <Text style={styles.title}>Signal lost</Text>
          <Text style={styles.message}>
            Something went wrong drawing the battle. You are back at the menu, where an unfinished battle can be resumed
            or discarded.
          </Text>
          <Button title="Back to the menu" onPress={this.handleReset} />
        </View>
      </Screen>
    );
  }
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center' },
  box: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  title: { color: colors.accent, fontSize: 28, fontWeight: '900' },
  message: { color: colors.text, fontSize: 15, textAlign: 'center', marginBottom: spacing.md },
});
