import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Coord,
  Difficulty,
  GameMode,
  GameState,
  Maneuver,
  PlayerIndex,
  Ship,
  aiChooseManeuver,
  aiChooseShot,
  createGame,
  defaultRng,
  endTurn,
  fire,
  maneuver,
  randomFleet,
} from './src/engine';
import { SavedGame, clearGame, loadGame, saveGame } from './src/storage';
import { ErrorBoundary } from './src/ui/components/ErrorBoundary';
import { feedback } from './src/ui/feedback';
import { GameOverScreen } from './src/ui/screens/GameOverScreen';
import { GameScreen } from './src/ui/screens/GameScreen';
import { HandoffScreen } from './src/ui/screens/HandoffScreen';
import { HomeScreen } from './src/ui/screens/HomeScreen';
import { SetupScreen } from './src/ui/screens/SetupScreen';

type Screen =
  | { name: 'home' }
  | { name: 'setup'; player: PlayerIndex }
  | { name: 'handoff'; player: PlayerIndex; reason: 'setup' | 'turn' }
  | { name: 'game' }
  | { name: 'over' };

const AI_NAME = 'Admiral Byte';
const AI_DELAY_MS = 900;

function playerNames(mode: GameMode): [string, string] {
  return mode === 'ai' ? ['You', AI_NAME] : ['Player 1', 'Player 2'];
}

function describeSave(state: GameState, savedAt: number): string {
  const mode = state.mode === 'ai' ? 'vs Computer' : 'Pass & Play';
  const turn = Math.floor(state.turn / 2) + 1;
  const days = Math.floor((Date.now() - savedAt) / 86400000);
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `${mode} · turn ${turn} · saved ${when}`;
}

type ResumeOffer = { state: GameState; difficulty: Difficulty; label: string };

function toOffer(s: SavedGame): ResumeOffer {
  return { state: s.state, difficulty: s.difficulty, label: describeSave(s.state, s.savedAt) };
}

export default function App() {
  const [mode, setMode] = useState<GameMode>('ai');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [fleets, setFleets] = useState<[Ship[] | null, Ship[] | null]>([null, null]);
  const [game, setGame] = useState<GameState | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [saved, setSaved] = useState<ResumeOffer | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Offer to resume whatever was left unfinished.
  useEffect(() => {
    let alive = true;
    void loadGame().then((s) => {
      if (alive && s) setSaved(toOffer(s));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
      if (overTimer.current) clearTimeout(overTimer.current);
    },
    [],
  );

  // Autosave whenever the board changes, and again when the app is backgrounded.
  useEffect(() => {
    if (!game || game.phase === 'over') return;
    void saveGame(game, difficulty);
  }, [game, difficulty]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && game && game.phase !== 'over') void saveGame(game, difficulty);
    });
    return () => sub.remove();
  }, [game, difficulty]);

  const names = playerNames(mode);

  const startSetup = useCallback(
    (m: GameMode) => {
      const go = () => {
        setMode(m);
        setFleets([null, null]);
        setGame(null);
        setScreen({ name: 'setup', player: 0 });
      };
      // The start buttons sit directly under the offer to resume, and the first
      // autosave of the new match overwrites the saved one. Games here run for
      // eighty turns a side, so ask before spending someone's mis-tap on one.
      // The save itself is left alone until then: backing out of setup keeps it.
      if (saved) {
        Alert.alert('Start a new battle?', 'The unfinished battle will be discarded once the new fleets are deployed.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard and start', style: 'destructive', onPress: go },
        ]);
        return;
      }
      go();
    },
    [saved],
  );

  const beginGame = useCallback((f0: Ship[], f1: Ship[], m: GameMode) => {
    const g = createGame({ mode: m, names: playerNames(m), fleets: [f0, f1], aiPlayer: m === 'ai' ? 1 : undefined });
    setSaved(null);
    setGame(g);
    // A local board is never shown without a handoff in front of it: the admiral
    // who just deployed is still holding the device.
    setScreen(m === 'local' ? { name: 'handoff', player: g.current, reason: 'turn' } : { name: 'game' });
  }, []);

  const onSetupReady = useCallback(
    (ships: Ship[]) => {
      if (screen.name !== 'setup') return;
      if (mode === 'ai') {
        beginGame(ships, randomFleet(defaultRng), mode);
        return;
      }
      if (screen.player === 0) {
        setFleets([ships, null]);
        setScreen({ name: 'handoff', player: 1, reason: 'setup' });
      } else {
        const f0 = fleets[0];
        if (!f0) return;
        beginGame(f0, ships, mode);
      }
    },
    [screen, mode, fleets, beginGame],
  );

  /** Play the computer's whole turn after a pause, then hand control back. */
  const scheduleAiTurn = useCallback(
    (g: GameState, level: Difficulty) => {
      setAiBusy(true);
      aiTimer.current = setTimeout(() => {
        let s = g;
        try {
          const ai = s.current;
          const res = fire(s, aiChooseShot(s, ai, defaultRng, level));
          s = res.state;
          if (res.result.result === 'hit') feedback.incoming();
          if (s.phase !== 'over') {
            const mv = aiChooseManeuver(s, ai, defaultRng, level);
            if (mv) s = maneuver(s, mv.shipId, mv.maneuver);
            s = endTurn(s);
          }
        } finally {
          setAiBusy(false);
        }
        setGame(s);
        if (s.phase === 'over') {
          void clearGame();
          setScreen({ name: 'over' });
        }
      }, AI_DELAY_MS);
    },
    [],
  );

  // The computer moves whenever it is on the move. Driving this from the state
  // rather than from onEndTurn also covers a match that was saved during the
  // computer's think time and resumed later, which would otherwise never move on.
  useEffect(() => {
    if (screen.name !== 'game' || !game || game.phase === 'over') return;
    if (aiBusy || !game.players[game.current].isAI) return;
    scheduleAiTurn(game, difficulty);
  }, [screen.name, game, aiBusy, difficulty, scheduleAiTurn]);

  const onFire = useCallback(
    (coord: Coord) => {
      if (!game) return;
      const res = fire(game, coord);
      if (res.result.sunk) feedback.sunk();
      else if (res.result.result === 'hit') feedback.hit();
      else feedback.miss();
      setGame(res.state);
      if (res.state.phase === 'over') {
        void clearGame();
        // Let the winning hit land on screen before the summary.
        overTimer.current = setTimeout(() => setScreen({ name: 'over' }), 700);
      }
    },
    [game],
  );

  const onManeuver = useCallback(
    (shipId: string, m: Maneuver) => {
      if (!game) return;
      feedback.maneuver();
      setGame(maneuver(game, shipId, m));
    },
    [game],
  );

  const onEndTurn = useCallback(() => {
    if (!game) return;
    const next = endTurn(game);
    setGame(next);
    if (next.mode === 'local') {
      setScreen({ name: 'handoff', player: next.current, reason: 'turn' });
    }
  }, [game]);

  const goHome = useCallback(() => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    if (overTimer.current) clearTimeout(overTimer.current);
    setAiBusy(false);
    // Keep an unfinished game so it can be picked up from the menu.
    if (game && game.phase !== 'over') {
      void saveGame(game, difficulty);
      setSaved({ state: game, difficulty, label: describeSave(game, Date.now()) });
    }
    setGame(null);
    setScreen({ name: 'home' });
  }, [game, difficulty]);

  /**
   * Recover from a render that threw. The state in hand is what failed to draw,
   * so it is dropped rather than saved back, and the offer is rebuilt from disk
   * through `loadGame` – which validates and discards a save it cannot read, so
   * a crash on resume cannot repeat forever.
   */
  const recoverToHome = useCallback(() => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    if (overTimer.current) clearTimeout(overTimer.current);
    setAiBusy(false);
    setGame(null);
    setScreen({ name: 'home' });
    void loadGame().then((s) => setSaved(s ? toOffer(s) : null));
  }, []);

  const onResume = useCallback(() => {
    if (!saved) return;
    setMode(saved.state.mode);
    setDifficulty(saved.difficulty);
    setGame(saved.state);
    setSaved(null);
    setScreen(
      saved.state.mode === 'local'
        ? { name: 'handoff', player: saved.state.current, reason: 'turn' }
        : { name: 'game' },
    );
  }, [saved]);

  const onDiscardSave = useCallback(() => {
    setSaved(null);
    void clearGame();
  }, []);

  const home = (
    <HomeScreen
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      onStart={startSetup}
      resume={saved ? { label: saved.label, onResume, onDiscard: onDiscardSave } : undefined}
    />
  );

  let content: React.ReactNode;
  switch (screen.name) {
    case 'home':
      content = home;
      break;
    case 'setup':
      content = (
        <SetupScreen key={screen.player} playerName={names[screen.player]} onReady={onSetupReady} onBack={goHome} />
      );
      break;
    case 'handoff':
      content = (
        <HandoffScreen
          playerName={names[screen.player]}
          message={
            screen.reason === 'setup'
              ? 'Deploy your fleet without the other admiral watching.'
              : 'Your turn. Keep the screen hidden until the device is in your hands.'
          }
          onReady={() => setScreen(screen.reason === 'setup' ? { name: 'setup', player: screen.player } : { name: 'game' })}
        />
      );
      break;
    case 'game':
      content = game ? (
        <GameScreen
          state={game}
          viewer={game.mode === 'ai' ? 0 : game.current}
          busy={aiBusy}
          onFire={onFire}
          onManeuver={onManeuver}
          onEndTurn={onEndTurn}
          onQuit={goHome}
        />
      ) : (
        home
      );
      break;
    case 'over':
      content = game ? (
        <GameOverScreen state={game} onRematch={() => startSetup(game.mode)} onHome={goHome} />
      ) : (
        home
      );
      break;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <ErrorBoundary onReset={recoverToHome}>{content}</ErrorBoundary>
    </SafeAreaProvider>
  );
}
