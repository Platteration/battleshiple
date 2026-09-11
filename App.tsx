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

/** Shown when a battle could not be played and its save is still on the device. */
const SET_ASIDE_NOTICE =
  'That battle could not be played, so it is not being offered here. It has not been deleted – the next launch will offer it again.';
/** ...and when the save behind it could not be read back at all. */
const UNREADABLE_NOTICE = 'That battle could not be played, and the save it came from could not be read back.';

/**
 * Enough of a state to recognise the same battle, at the same half-turn, coming
 * back off the disk: the autosave writes whatever is on screen, so the state a
 * turn failed on is the one `loadGame` hands back. Lengths are deliberately not
 * part of it, because a save may be clipped on its way in.
 */
function saveSignature(s: GameState): string {
  return [s.mode, s.turn, s.current, s.phase, s.maneuveredShipId ?? ''].join(':');
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
  const [notice, setNotice] = useState<string | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The recovery below runs from a timer and from the error boundary, neither of
  // which can see what the current render is holding.
  const gameRef = useRef<GameState | null>(null);
  /** The battle a turn has already failed on, so it is not offered again. */
  const failedSave = useRef<string | null>(null);
  /** ...and whether that battle is still on the disk for a new one to spend. */
  const setAside = useRef(false);

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

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

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
        setNotice(null);
        setAside.current = false;
        setMode(m);
        setFleets([null, null]);
        setGame(null);
        setScreen({ name: 'setup', player: 0 });
      };
      // The start buttons sit directly under the offer to resume, and the first
      // autosave of the new match overwrites the saved one. Games here run for
      // eighty turns a side, so ask before spending someone's mis-tap on one.
      // The save itself is left alone until then: backing out of setup keeps it.
      // A battle set aside by the recovery below is not offered on the menu but
      // is still on the disk, so it is still something a new match would spend.
      if (saved || setAside.current) {
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

  /**
   * Give up on a turn that cannot be played – a screen that threw while drawing,
   * the computer's own timer below, or a state the driver has decided it cannot
   * play at all. The state in hand is what failed, so it is dropped rather than
   * saved back, and the offer is rebuilt from disk.
   *
   * What is on the disk, though, is the state that just failed: the autosave
   * writes whatever is on screen, and `loadGame` only deletes a save it
   * *refuses* – which a save that got this far, by definition, is not. So the
   * battle that failed is remembered here and left off the menu, or resuming
   * would hand the player straight back into the same failure for as long as
   * they kept pressing the button. This recovery does not delete it: the fault
   * may well be ours, and a later build may play it perfectly.
   */
  const recoverToHome = useCallback((err?: unknown) => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    if (overTimer.current) clearTimeout(overTimer.current);
    // Never swallowed. A regression in the engine or in the driver shows up to a
    // player as 'the app went back to the menu', and this is the only trace of
    // what it actually was.
    if (err !== undefined) console.error('Battleshiple: gave up on a turn that could not be played', err);
    const failed = gameRef.current;
    if (failed) failedSave.current = saveSignature(failed);
    setAiBusy(false);
    setGame(null);
    setScreen({ name: 'home' });
    void loadGame().then((s) => {
      // The battle that just failed is the one on the disk; anything else there
      // is a different battle and is offered as usual.
      const offerable = !!s && saveSignature(s.state) !== failedSave.current;
      setSaved(offerable && s ? toOffer(s) : null);
      setAside.current = !!s && !offerable;
      if (!failed || offerable) setNotice(null);
      else setNotice(s ? SET_ASIDE_NOTICE : UNREADABLE_NOTICE);
    });
  }, []);

  /** Play the computer's whole turn after a pause, then hand control back. */
  const scheduleAiTurn = useCallback(
    (g: GameState, level: Difficulty) => {
      setAiBusy(true);
      aiTimer.current = setTimeout(() => {
        let s = g;
        let hit = false;
        try {
          const ai = s.current;
          const res = fire(s, aiChooseShot(s, ai, defaultRng, level));
          s = res.state;
          hit = res.result.result === 'hit';
          if (s.phase !== 'over') {
            const mv = aiChooseManeuver(s, ai, defaultRng, level);
            if (mv) s = maneuver(s, mv.shipId, mv.maneuver);
            s = endTurn(s);
          }
        } catch (err) {
          // A throw here is on the timer's own stack, where no error boundary can
          // see it and React Native turns it into a fatal exception. Drop the
          // state that could not be played rather than take the process with it.
          recoverToHome(err);
          return;
        } finally {
          setAiBusy(false);
        }
        // Outside the try: haptics are best-effort, and a buzz that failed is
        // not a turn that failed.
        if (hit) feedback.incoming();
        setGame(s);
        if (s.phase === 'over') {
          void clearGame();
          setScreen({ name: 'over' });
        }
      }, AI_DELAY_MS);
    },
    [recoverToHome],
  );

  // The computer moves whenever it is on the move. Driving this from the state
  // rather than from onEndTurn also covers a match that was saved during the
  // computer's think time and resumed later, which would otherwise never move on.
  useEffect(() => {
    if (screen.name !== 'game' || !game || game.phase === 'over') return;
    if (aiBusy || !game.players[game.current].isAI) return;
    // The computer only ever has a turn to take from the firing phase, and the
    // validator refuses a save that says otherwise. If one reaches here anyway,
    // playing it throws inside the timer above – and simply declining to play it
    // is worse than that, not better: the player to move is the computer, so the
    // board is disabled, no button on the screen advances anything, and the only
    // way out is to quit. Give up on it the way a failed turn does.
    if (game.phase !== 'fire') {
      recoverToHome();
      return;
    }
    scheduleAiTurn(game, difficulty);
  }, [screen.name, game, aiBusy, difficulty, scheduleAiTurn, recoverToHome]);

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
      notice={notice ?? undefined}
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
