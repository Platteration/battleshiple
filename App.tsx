import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Coord,
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

export default function App() {
  const [mode, setMode] = useState<GameMode>('ai');
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [fleets, setFleets] = useState<[Ship[] | null, Ship[] | null]>([null, null]);
  const [game, setGame] = useState<GameState | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
  }, []);

  const names = playerNames(mode);

  const startSetup = useCallback((m: GameMode) => {
    setMode(m);
    setFleets([null, null]);
    setGame(null);
    setScreen({ name: 'setup', player: 0 });
  }, []);

  const beginGame = useCallback(
    (f0: Ship[], f1: Ship[], m: GameMode) => {
      const g = createGame({ mode: m, names: playerNames(m), fleets: [f0, f1], aiPlayer: m === 'ai' ? 1 : undefined });
      setGame(g);
      setScreen({ name: 'game' });
    },
    [],
  );

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

  /** Run the computer's whole turn after a short pause, then hand control back. */
  const scheduleAiTurn = useCallback((g: GameState) => {
    setAiBusy(true);
    aiTimer.current = setTimeout(() => {
      let s = g;
      try {
        const ai = s.current;
        const shot = aiChooseShot(s, ai, defaultRng);
        const res = fire(s, shot);
        s = res.state;
        if (s.phase !== 'over') {
          const mv = aiChooseManeuver(s, ai, defaultRng);
          if (mv) s = maneuver(s, mv.shipId, mv.maneuver);
          s = endTurn(s);
        }
      } finally {
        setAiBusy(false);
      }
      setGame(s);
      if (s.phase === 'over') setScreen({ name: 'over' });
    }, AI_DELAY_MS);
  }, []);

  const onFire = useCallback(
    (coord: Coord) => {
      if (!game) return;
      const res = fire(game, coord);
      setGame(res.state);
      if (res.state.phase === 'over') {
        // Let the player see the final hit before the summary.
        setTimeout(() => setScreen({ name: 'over' }), 700);
      }
    },
    [game],
  );

  const onManeuver = useCallback(
    (shipId: string, m: Maneuver) => {
      if (!game) return;
      setGame(maneuver(game, shipId, m));
    },
    [game],
  );

  const onEndTurn = useCallback(() => {
    if (!game) return;
    const next = endTurn(game);
    setGame(next);
    if (next.mode === 'ai') {
      scheduleAiTurn(next);
    } else {
      setScreen({ name: 'handoff', player: next.current, reason: 'turn' });
    }
  }, [game, scheduleAiTurn]);

  const goHome = useCallback(() => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    setAiBusy(false);
    setGame(null);
    setScreen({ name: 'home' });
  }, []);

  let content: React.ReactNode;
  switch (screen.name) {
    case 'home':
      content = <HomeScreen onStart={startSetup} />;
      break;
    case 'setup':
      content = (
        <SetupScreen
          key={screen.player}
          playerName={names[screen.player]}
          onReady={onSetupReady}
          onBack={goHome}
        />
      );
      break;
    case 'handoff':
      content = (
        <HandoffScreen
          playerName={names[screen.player]}
          message={screen.reason === 'setup' ? 'Deploy your fleet without the other admiral watching.' : 'Your turn. Keep the screen hidden until the device is in your hands.'}
          onReady={() => setScreen(screen.reason === 'setup' ? { name: 'setup', player: screen.player } : { name: 'game' })}
        />
      );
      break;
    case 'game':
      if (!game) {
        content = <HomeScreen onStart={startSetup} />;
        break;
      }
      content = (
        <GameScreen
          state={game}
          viewer={game.mode === 'ai' ? 0 : game.current}
          busy={aiBusy}
          onFire={onFire}
          onManeuver={onManeuver}
          onEndTurn={onEndTurn}
          onQuit={goHome}
        />
      );
      break;
    case 'over':
      content = game ? (
        <GameOverScreen state={game} onRematch={() => startSetup(game.mode)} onHome={goHome} />
      ) : (
        <HomeScreen onStart={startSetup} />
      );
      break;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {content}
    </SafeAreaProvider>
  );
}
