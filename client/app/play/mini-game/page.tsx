'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { connectSocket } from '@/lib/socket';
import { usePlayerSession } from '../playerSession';
import {
  applyPlayerRestoreBundle,
  fetchPlayerRestore,
  readPlayerSnapshot,
  setSnapshotFromRemoteBundle,
  setSnapshotSessionPayload,
  snapshotToRestoreBundle,
  type PlayerRestoreBundle,
} from '../playerSnapshotStorage';
import { Button } from '@/components/shared/Button';
import { cn } from '@/lib/utils';
import {
  DEFAULT_KANGAROO_NAMES,
  defaultKangarooNames,
  resolveKangarooNames,
} from '@/lib/kangarooRaceDefaults';

type MiniGameType = 'kangaroo_race' | 'card_shuffle' | null;

interface HorseOption {
  id: number;
  buttonClass: string;
}

const HORSES: HorseOption[] = [
  { id: 1, buttonClass: 'bg-[#008df5] shadow-[0_7px_0_#005aa3]' },
  { id: 2, buttonClass: 'bg-[#ff8900] shadow-[0_7px_0_#b45f00]' },
  { id: 3, buttonClass: 'bg-[#2aac00] shadow-[0_7px_0_#1f7b00]' },
  { id: 4, buttonClass: 'bg-[#e09b00] shadow-[0_7px_0_#9a6b00]' },
  { id: 5, buttonClass: 'bg-[#6c00c8] shadow-[0_7px_0_#42007c]' },
  { id: 6, buttonClass: 'bg-[#d50024] shadow-[0_7px_0_#8a0017]' },
];
const CARD_POSITIONS = [
  { id: 1, label: 'LEFT' },
  { id: 2, label: 'MIDDLE' },
  { id: 3, label: 'RIGHT' },
] as const;

const CARD_LABEL_MAP: Record<number, string> = { 1: 'LEFT', 2: 'MIDDLE', 3: 'RIGHT' };
const CARD_ROUND_BONUS: Record<1 | 2 | 3 | 4, number> = {
  1: 10,
  2: 20,
  3: 30,
  4: 50,
};
const CARD_FINISHED_MESSAGE = '';
const MINI_GAME_FINISHED_MESSAGE = '';
const KANGAROO_VENUE_FOOTER = 'THIS RACE WILL BE SHOWN ON THE VENUE SCREENS';
const CARD_IMAGE_FACE_DOWN = '/games/card-shuffle/facedowncard.png';
const CARD_IMAGE_JOKER = '/games/card-shuffle/jokercard.png';
const CARD_IMAGE_QUEEN = '/games/card-shuffle/queencard.png';

/** Unity may send 1–3 (Left/Middle/Right) or 0–2; player UI always uses 1–3.
 *  IMPORTANT: explicitly reject null/undefined/empty before Number(),
 *  because `Number(null)` is 0 and would otherwise be treated as a valid
 *  0-based "Left" pick — making a player who didn't pick at all look like
 *  they picked Left and showing the wrong reveal copy. */
function normalizeCardSlotToChoice(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t >= 1 && t <= 3) return t;
  if (t >= 0 && t <= 2) return t + 1;
  return null;
}

function normalizeMiniGameId(game: unknown): string {
  if (game == null || game === '') return '';
  return String(game).toLowerCase().replace(/-/g, '_');
}

function normalizeUnityPayload(value: unknown, depth = 0): Record<string, unknown> {
  if (depth > 10) return {};
  if (value == null) return {};
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return normalizeUnityPayload(parsed, depth + 1);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

type ResultPhase = null | 'winner' | 'loser' | 'finished';

function MobileFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-[#050017]">
      <div
        className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
        style={{
          backgroundImage: "url('/mobilebackground.png')",
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function MiniGamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, clearSession } = usePlayerSession();

  const gameParam = searchParams.get('game') as MiniGameType;
  const [gameType, setGameType] = useState<MiniGameType>(gameParam);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  /** Same as selectedChoice but stable for socket handlers (avoid stale closure / effect churn). */
  const lockedPickRef = useRef<number | null>(null);
  const selectedChoiceRef = useRef<number | null>(null);
  const [resultPhase, setResultPhase] = useState<ResultPhase>(null);
  const [winningValue, setWinningValue] = useState<number | null>(null);
  const [kangarooNames, setKangarooNames] = useState<string[]>(defaultKangarooNames());
  const [finishRank, setFinishRank] = useState<number | null>(null);
  const [pointsEarned, setPointsEarned] = useState<number | null>(null);
  const [finishOrder, setFinishOrder] = useState<number[]>([]);
  const [roundOpen, setRoundOpen] = useState(false);
  /** True once Unity sends SHUFFLE_COMPLETE — cards have stopped, player should pick. */
  const [shuffleComplete, setShuffleComplete] = useState(false);
  const [activeCardRound, setActiveCardRound] = useState<1 | 2 | 3 | 4 | null>(null);
  /** Short banner when host starts round 1 / advances to round 2+ */
  const [roundAnnouncement, setRoundAnnouncement] = useState<string | null>(null);
  const [miniGameEndMessage, setMiniGameEndMessage] = useState<string>(MINI_GAME_FINISHED_MESSAGE);
  const sessionPinRef = useRef(session.pin);
  sessionPinRef.current = session.pin;
  const sessionTeamIdRef = useRef(session.teamId);
  sessionTeamIdRef.current = session.teamId;
  const sessionTeamNameRef = useRef(session.teamName);
  sessionTeamNameRef.current = session.teamName;
  const lastGameStateRef = useRef<any>(null);
  const miniRestoreGuardRef = useRef<{ pin: string; teamId: number } | null>(null);
  selectedChoiceRef.current = selectedChoice;
  const labelForKangaroo = (slot: number | null) => {
    if (!Number.isFinite(Number(slot))) return '';
    const idx = Number(slot) - 1;
    const name = kangarooNames[idx] || DEFAULT_KANGAROO_NAMES[idx] || `Kangaroo #${slot}`;
    return name;
  };

  useEffect(() => {
    if (!session.pin || !session.teamId) {
      router.replace('/play/join');
      return;
    }
  }, [session, router]);

  useEffect(() => {
    /** Singleton; read here so listeners always register (avoids first-paint `useSocket` null). */
    const socket = connectSocket();

    const logSocketIn = (event: string, payload?: unknown) => {
      console.log('[play/mini-game][socket][in]', event, payload ?? null);
    };

    /** Re‑join the session room after any reconnect (Fast Refresh, network drop, etc.)
     *  join_session is blocked by the name-collision guard when the old socket is still
     *  briefly alive — mini_game_rejoin bypasses that and also replays the reveal state. */
    const rejoinSession = () => {
      const pin = sessionPinRef.current;
      const teamId = sessionTeamIdRef.current;
      const teamName = sessionTeamNameRef.current;
      if (!pin || !teamId) return;
      console.log('[play/mini-game] reconnected — emitting mini_game_rejoin', { pin, teamId });
      socket.emit('mini_game_rejoin', {
        pin,
        teamId,
        teamName,
      });
    };
    socket.on('connect', rejoinSession);
    // Also rejoin immediately if the socket is already connected.
    if (socket.connected) rejoinSession();

    const exitMiniGameToGame = () => {
      lockedPickRef.current = null;
      setSelectedChoice(null);
      setResultPhase(null);
      setWinningValue(null);
      setRoundOpen(false);
      setShuffleComplete(false);
      setActiveCardRound(null);
      setRoundAnnouncement(null);
      router.replace('/play/game');
    };

    const shouldExitMiniGame = () => {
      // If the server still has a mini-game active, don't kick the player back
      // to the main game route (prevents ping-pong refresh loops during break_end /
      // round_intro / question_active broadcasts).
      const active = lastGameStateRef.current?.activeMiniGame;
      if (active === undefined) return false; // don't guess before first session_state
      return !active;
    };

    const applyCardShuffleReveal = (payload: {
      correctPosition?: number;
      correct_position?: number;
      roundNumber?: number;
    }) => {
      setGameType('card_shuffle');
      const raw = payload.correctPosition ?? payload.correct_position;
      const winning = normalizeCardSlotToChoice(raw);
      setWinningValue(winning);
      setRoundOpen(false);
      setRoundAnnouncement(null);
      const rn = Number(payload.roundNumber);
      if (Number.isFinite(rn) && rn >= 1 && rn <= 4) {
        setActiveCardRound(rn as 1 | 2 | 3 | 4);
      }
      const pick = lockedPickRef.current ?? selectedChoiceRef.current;
      if (pick !== null) {
        lockedPickRef.current = pick;
        setSelectedChoice(pick);
      }
      if (winning !== null && pick !== null) {
        setResultPhase(pick === winning ? 'winner' : 'loser');
      } else {
        setResultPhase('loser');
      }
    };

    const onMiniGameStart = (data: {
      game: string;
      kangarooNames?: string[];
      /** Server mini_game_rejoin replay — do not reset roundOpen / picks; `session_state` follows. */
      rejoinReplay?: boolean;
    }) => {
      logSocketIn('mini_game_start', data);
      setGameType(data.game as MiniGameType);
      if (Array.isArray(data.kangarooNames) && data.kangarooNames.length >= 6) {
        setKangarooNames(resolveKangarooNames(data.kangarooNames));
      }
      if (data.rejoinReplay) {
        return;
      }
      lockedPickRef.current = null;
      setSelectedChoice(null);
      setResultPhase(null);
      setWinningValue(null);
      setFinishRank(null);
      setPointsEarned(null);
      setFinishOrder([]);
      setRoundOpen(normalizeMiniGameId(data.game) === 'kangaroo_race');
      setActiveCardRound(null);
      setRoundAnnouncement(null);
    };

    const onMiniGameCommand = (data: {
      game?: string;
      command?: 'start_game' | 'next_round' | 'reveal_cards' | 'reveal_winner';
      roundNumber?: number;
      kangarooNames?: string[];
      cardShuffleReveal?: {
        game?: string;
        correctPosition?: number;
        correct_position?: number;
        roundNumber?: number;
        cardPositions?: number[];
      };
    }) => {
      logSocketIn('mini_game_command', data);
      const gid = normalizeMiniGameId(data?.game);
      if (gid === 'kangaroo_race') {
        if (data.command === 'start_game') {
          if (Array.isArray(data.kangarooNames) && data.kangarooNames.length >= 6) {
            setKangarooNames(resolveKangarooNames(data.kangarooNames));
          }
          setRoundOpen(false);
          setShuffleComplete(false);
          setRoundAnnouncement('RACE STARTED — WATCH THE VENUE SCREEN');
          window.setTimeout(() => setRoundAnnouncement(null), 2200);
        }
        if (data.command === 'reveal_winner') {
          setRoundOpen(false);
          setRoundAnnouncement('REVEALING WINNER...');
          window.setTimeout(() => setRoundAnnouncement(null), 1800);
        }
        return;
      }

      if (gid !== 'card_shuffle') return;
      if (data.command === 'reveal_cards') {
        // Server now explicitly sends mini_game_reveal after reveal_cards.
        // We just log here — the result will come via onMiniGameReveal.
        console.log(
          '[play/mini-game] mini_game_command reveal_cards — waiting for mini_game_reveal from server',
        );
      }
      if (data.command === 'start_game' || data.command === 'next_round') {
        lockedPickRef.current = null;
        setSelectedChoice(null);
        setResultPhase(null);
        setWinningValue(null);
        setRoundOpen(true);
        setShuffleComplete(false);
        const n =
          data.command === 'start_game'
            ? 1
            : Number.isFinite(Number(data.roundNumber))
              ? Number(data.roundNumber)
              : 2;
        if (n >= 1 && n <= 4) {
          setActiveCardRound(n as 1 | 2 | 3 | 4);
        }
        setRoundAnnouncement(`Round ${n} — make your pick`);
        window.setTimeout(() => setRoundAnnouncement(null), 2800);
      }
    };

    const onMiniGameReveal = (data: {
      game?: string;
      correctPosition?: number;
      correct_position?: number;
      winningKangaroo?: number;
      finishOrder?: number[];
      kangarooNames?: string[];
      roundNumber?: number;
      cardPositions?: number[];
    }) => {
      logSocketIn('mini_game_reveal', data);
      const gid = normalizeMiniGameId(data?.game);
      if (gid === 'kangaroo_race') {
        const winning = Number(data?.winningKangaroo);
        if (Array.isArray(data.kangarooNames) && data.kangarooNames.length >= 6) {
          setKangarooNames(resolveKangarooNames(data.kangarooNames));
        }
        const parsedFinishOrder = Array.isArray(data.finishOrder)
          ? data.finishOrder
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value) && value >= 1 && value <= 6)
          : [];
        setFinishOrder(parsedFinishOrder);
        setGameType('kangaroo_race');
        setWinningValue(Number.isFinite(winning) ? winning : null);
        setRoundOpen(false);
        setRoundAnnouncement(null);
        const pick = lockedPickRef.current ?? selectedChoiceRef.current;
        if (Number.isFinite(winning) && pick !== null) {
          setResultPhase(pick === winning ? 'winner' : 'loser');
        }
        return;
      }

      if (gid && gid !== 'card_shuffle') return;
      console.log(
        '[play/mini-game] mini_game_reveal (authoritative winning slot from server):',
        data,
      );
      applyCardShuffleReveal(data);
    };

    const onMiniGamePlayerResult = (data: {
      game?: string;
      result?: 'winner' | 'loser';
      correctPosition?: number;
      correct_position?: number;
      winningKangaroo?: number;
      finishOrder?: number[];
      kangarooNames?: string[];
      selectedChoice?: number | null;
      finishRank?: number | null;
      pointsEarned?: number | null;
      roundNumber?: number;
    }) => {
      logSocketIn('mini_game_player_result', data);
      const gid = normalizeMiniGameId(data?.game);
      if (gid === 'kangaroo_race') {
        const winning = Number(data?.winningKangaroo);
        const selected = Number(data?.selectedChoice);
        if (Array.isArray(data.kangarooNames) && data.kangarooNames.length >= 6) {
          setKangarooNames(resolveKangarooNames(data.kangarooNames));
        }
        const parsedFinishOrder = Array.isArray(data.finishOrder)
          ? data.finishOrder
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value) && value >= 1 && value <= 6)
          : [];
        setFinishOrder(parsedFinishOrder);
        const rank = Number(data.finishRank);
        const points = Number(data.pointsEarned);
        setFinishRank(Number.isFinite(rank) && rank > 0 ? rank : null);
        setPointsEarned(Number.isFinite(points) ? points : null);

        setGameType('kangaroo_race');
        setWinningValue(Number.isFinite(winning) ? winning : null);
        setRoundOpen(false);
        setRoundAnnouncement(null);

        if (Number.isFinite(selected) && selected >= 1 && selected <= 6) {
          lockedPickRef.current = selected;
          setSelectedChoice(selected);
        }

        setResultPhase(data?.result === 'winner' ? 'winner' : 'loser');
        return;
      }

      if (gid && gid !== 'card_shuffle') return;

      const winning = normalizeCardSlotToChoice(data?.correctPosition ?? data?.correct_position);
      const selected = normalizeCardSlotToChoice(data?.selectedChoice);

      setGameType('card_shuffle');
      setWinningValue(winning);
      setRoundOpen(false);
      setRoundAnnouncement(null);
      const rn = Number(data?.roundNumber);
      if (Number.isFinite(rn) && rn >= 1 && rn <= 4) {
        setActiveCardRound(rn as 1 | 2 | 3 | 4);
      }

      if (selected !== null) {
        lockedPickRef.current = selected;
        setSelectedChoice(selected);
      }

      setResultPhase(data?.result === 'winner' ? 'winner' : 'loser');
    };

    const onMiniGameUpdate = (data: {
      source?: string;
      action?: string;
      value?: unknown;
      game?: string;
    }) => {
      logSocketIn('mini_game_update', data);
      const gid = normalizeMiniGameId(data?.game);
      if (gid && gid !== 'card_shuffle' && data?.source !== 'unity') return;

      const action = String(data?.action || '').toUpperCase();
      const directValue = normalizeUnityPayload(data?.value);
      const nestedPayload = normalizeUnityPayload(directValue.payload);

      if (action === 'SHUFFLE_COMPLETE') {
        // Cards have stopped shuffling — mark it so the UI prompts the player to pick.
        // Win/lose is only shown after the HOST taps "reveal".
        console.log(
          '[play/mini-game] mini_game_update SHUFFLE_COMPLETE — cards stopped, round stays open for picking',
          {
            correctPosition:
              nestedPayload.correct_position ??
              directValue.correct_position ??
              '(hidden until host reveals)',
          },
        );
        setShuffleComplete(true);
        // Do NOT call applyCardShuffleReveal here.
        return;
      }

      // MINIGAME_REVEAL and ROUND_COMPLETE no longer auto-reveal on mobile.
      // The host controls the reveal via reveal_cards → mini_game_reveal.
      if (action === 'MINIGAME_REVEAL' || action === 'ROUND_COMPLETE') {
        console.log(
          `[play/mini-game] mini_game_update ${action} — ignoring (host controls reveal)`,
        );
        return;
      }

      if (action === 'GAME_COMPLETE' || action === 'RAW') {
        const resultType = String(directValue.type || '').toUpperCase();
        console.log('[play/mini-game] mini_game_update GAME_COMPLETE/RAW resultType:', resultType);
        // No auto-reveal for any sub-type — host controls it.
      }
    };

    const onMiniGameEnd = (data: {
      game?: string;
      winningCard?: number;
      winningKangaroo?: number;
      holdScreen?: boolean;
      status?: string;
      message?: string;
    }) => {
      logSocketIn('mini_game_end', data);
      if (data?.holdScreen && normalizeMiniGameId(data?.game) === 'card_shuffle') {
        setGameType('card_shuffle');
        setWinningValue(null);
        setRoundOpen(false);
        setMiniGameEndMessage(data?.message || MINI_GAME_FINISHED_MESSAGE);
        setRoundAnnouncement(data?.message || CARD_FINISHED_MESSAGE);
        setResultPhase('finished');
        return;
      }
      if (data?.holdScreen && normalizeMiniGameId(data?.game) === 'kangaroo_race') {
        setGameType('kangaroo_race');
        setWinningValue(null);
        setRoundOpen(false);
        setMiniGameEndMessage(data?.message || MINI_GAME_FINISHED_MESSAGE);
        setRoundAnnouncement(data?.message || MINI_GAME_FINISHED_MESSAGE);
        setResultPhase('finished');
        return;
      }
      const winning = data.winningCard ?? data.winningKangaroo ?? null;
      setWinningValue(winning);
      lockedPickRef.current = null;
      setSelectedChoice(null);
      setResultPhase(null);
      setRoundOpen(false);
      setRoundAnnouncement(null);
      router.replace('/play/game');
    };

    const onBreakEnd = () => {
      logSocketIn('break_end');
      if (shouldExitMiniGame()) exitMiniGameToGame();
    };

    const onRoundIntro = () => {
      logSocketIn('round_intro');
      // Host resumed trivia after mini-game "game over" hold — leave even if
      // session_state has not arrived yet (holdScreen skips that emit).
      if (shouldExitMiniGame()) exitMiniGameToGame();
    };

    const onQuestionActive = () => {
      logSocketIn('question_active');
      if (shouldExitMiniGame()) exitMiniGameToGame();
    };

    const onAnswerReveal = () => {
      logSocketIn('answer_reveal');
      if (shouldExitMiniGame()) exitMiniGameToGame();
    };

    const onScoreboard = () => {
      logSocketIn('scoreboard');
      if (shouldExitMiniGame()) exitMiniGameToGame();
    };

    const onSessionState = (data: any) => {
      logSocketIn('session_state', data);
      const gameState = data?.gameState ?? data;
      if (!gameState || !gameState.state) return;
      lastGameStateRef.current = gameState;

      const p = sessionPinRef.current;
      const t = sessionTeamIdRef.current != null ? Number(sessionTeamIdRef.current) : NaN;
      if (p && Number.isFinite(t)) {
        setSnapshotSessionPayload(p, t, data);
      }

      // ── Restore kangaroo race state on rejoin / refresh ──
      if (gameState?.miniGameState?.game === 'kangaroo_race') {
        const mgs = gameState.miniGameState;
        const names = Array.isArray(mgs.kangarooNames)
          ? mgs.kangarooNames
          : Array.isArray(gameState.miniGameConfig?.kangarooNames)
            ? gameState.miniGameConfig.kangarooNames
            : null;
        if (names?.length >= 6) {
          setKangarooNames(resolveKangarooNames(names));
        }
        // Pick only before the host starts the race (gameStarted locks the window).
        const racePickPhaseActive = !mgs.revealed && !mgs.gameStarted;

        if (!mgs.revealed) {
          setGameType('kangaroo_race');
          setRoundOpen(racePickPhaseActive);
          // Restore the player's existing pick if any
          const teamId = sessionTeamIdRef.current;
          if (teamId && mgs.selections) {
            const existingPick = mgs.selections[String(teamId)];
            if (existingPick != null && Number.isFinite(Number(existingPick))) {
              const pick = Number(existingPick);
              lockedPickRef.current = pick;
              setSelectedChoice(pick);
            }
          }
        }
        // If revealed, show results
        if (mgs.revealed && Array.isArray(mgs.finishOrder) && mgs.finishOrder.length > 0) {
          setRoundOpen(false);
          // The reveal/result events will handle the result phase
        }
      }

      // ── Restore card shuffle state on rejoin / refresh ──
      if (gameState?.miniGameState?.game === 'card_shuffle') {
        const mgs = gameState.miniGameState;
        if (mgs.gameStarted && !mgs.revealed && mgs.activeRound != null) {
          setGameType('card_shuffle');
          setRoundOpen(true);
          const rn = Number(mgs.activeRound);
          if (Number.isFinite(rn) && rn >= 1 && rn <= 4) {
            setActiveCardRound(rn as 1 | 2 | 3 | 4);
          }
          // Restore the player's existing pick if any
          const teamId = sessionTeamIdRef.current;
          if (teamId && mgs.selections) {
            const existingPick = mgs.selections[String(teamId)];
            if (existingPick != null && Number.isFinite(Number(existingPick))) {
              const pick = Number(existingPick);
              lockedPickRef.current = pick;
              setSelectedChoice(pick);
            }
          }
        }
      }

      if (!gameState.activeMiniGame && gameState.state !== 'LOBBY') {
        exitMiniGameToGame();
      }
    };

    const onGameEnd = () => {
      logSocketIn('game_end');
      clearSession();
      router.replace('/play/join');
    };

    const onSessionDeleted = (data: { pin?: string }) => {
      logSocketIn('session_deleted', data);
      const pin = data?.pin ? String(data.pin) : '';
      if (!pin || pin !== String(sessionPinRef.current)) return;
      clearSession();
      router.replace('/play/join');
    };

    const onDisconnect = (reason: string) => {
      console.warn('[play/mini-game][socket][disconnect]', reason);
    };

    const onConnectError = (error: Error) => {
      console.error('[play/mini-game][socket][connect_error]', error?.message || error);
    };

    const pinRestore = sessionPinRef.current;
    const tidRestore = sessionTeamIdRef.current != null ? Number(sessionTeamIdRef.current) : NaN;
    const abortMiniRestore = new AbortController();
    const applyRestoreBundleMini = (bundle: PlayerRestoreBundle | null | undefined) => {
      if (!bundle?.sessionPayload || !pinRestore || !Number.isFinite(tidRestore)) return;
      // Replays may still contain `round_intro` / `question_active` / … from the trivia
      // flow. Those handlers call `exitMiniGameToGame` (full navigation to `/play/game`).
      // When the host then launches a mini-game, `/play/game` immediately pushes back here
      // → remount → restore runs again → infinite “refresh” loop on mobile.
      // On this route we only need `session_state` + mini-game–specific events.
      applyPlayerRestoreBundle(bundle, {
        session_state: (d) => onSessionState(d as any),
        mini_game_start: (d) => onMiniGameStart(d as any),
        mini_game_reveal: (d) => onMiniGameReveal(d as any),
        mini_game_player_result: (d) => onMiniGamePlayerResult(d as any),
        game_end: () => onGameEnd(),
      });
    };

    const gMini = miniRestoreGuardRef.current;
    const sameMini =
      gMini &&
      gMini.pin === pinRestore &&
      Number(gMini.teamId) === tidRestore &&
      Number.isFinite(tidRestore);
    if (!sameMini && Number.isFinite(tidRestore) && pinRestore) {
      miniRestoreGuardRef.current = { pin: pinRestore, teamId: tidRestore };
      void (async () => {
        const local = snapshotToRestoreBundle(readPlayerSnapshot(pinRestore, tidRestore));
        if (local) applyRestoreBundleMini(local);
        const remote = await fetchPlayerRestore(pinRestore, tidRestore, abortMiniRestore.signal);
        if (remote) {
          setSnapshotFromRemoteBundle(pinRestore, tidRestore, remote);
          applyRestoreBundleMini(remote);
        }
      })();
    }

    socket.on('mini_game_start', onMiniGameStart);
    socket.on('mini_game_command', onMiniGameCommand);
    socket.on('mini_game_reveal', onMiniGameReveal);
    socket.on('mini_game_player_result', onMiniGamePlayerResult);
    socket.on('mini_game_update', onMiniGameUpdate);
    socket.on('mini_game_end', onMiniGameEnd);
    socket.on('break_end', onBreakEnd);
    socket.on('round_intro', onRoundIntro);
    socket.on('question_active', onQuestionActive);
    socket.on('answer_reveal', onAnswerReveal);
    socket.on('scoreboard', onScoreboard);
    socket.on('session_state', onSessionState);
    socket.on('game_end', onGameEnd);
    socket.on('session_deleted', onSessionDeleted);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      abortMiniRestore.abort();
      miniRestoreGuardRef.current = null;
      socket.off('connect', rejoinSession);
      socket.off('mini_game_start', onMiniGameStart);
      socket.off('mini_game_command', onMiniGameCommand);
      socket.off('mini_game_reveal', onMiniGameReveal);
      socket.off('mini_game_player_result', onMiniGamePlayerResult);
      socket.off('mini_game_update', onMiniGameUpdate);
      socket.off('mini_game_end', onMiniGameEnd);
      socket.off('break_end', onBreakEnd);
      socket.off('round_intro', onRoundIntro);
      socket.off('question_active', onQuestionActive);
      socket.off('answer_reveal', onAnswerReveal);
      socket.off('scoreboard', onScoreboard);
      socket.off('session_state', onSessionState);
      socket.off('game_end', onGameEnd);
      socket.off('session_deleted', onSessionDeleted);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, [router, clearSession, session.pin, session.teamId, session.teamName]);

  const handleChoice = (choiceId: number) => {
    const socket = connectSocket();
    if (!roundOpen || lockedPickRef.current !== null) return;
    lockedPickRef.current = choiceId;
    setSelectedChoice(choiceId);
    console.log('[play/mini-game][socket][out] mini_game_action', {
      action: 'select',
      value: choiceId,
    });
    socket.emit('mini_game_action', {
      action: 'select',
      value: choiceId,
    });
  };

  const activeRoundBonus =
    activeCardRound != null ? CARD_ROUND_BONUS[activeCardRound] : CARD_ROUND_BONUS[1];

  /** Card shuffle shows win/lose on the themed pick screen; horse race uses full-screen result. */
  if (resultPhase && gameType !== 'card_shuffle') {
    if (resultPhase === 'finished') {
      return (
        <MobileFrame>
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-6">
            <div className="mx-auto w-full max-w-md text-center">
              <h2 className="text-[clamp(3.2rem,18vw,5.6rem)] font-black uppercase leading-[0.9] tracking-[0.05em] text-[#59d8ff] [text-shadow:0_0_0_rgb(0,0,0),0_2px_0_#0d4d89,0_0_18px_rgba(89,216,255,0.8)]">
                GAME
                <br />
                OVER
              </h2>
              <p className="mt-8 text-[1.05rem] font-extrabold leading-snug text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
                {miniGameEndMessage}
              </p>
            </div>
          </div>
        </MobileFrame>
      );
    }

    const isWinner = resultPhase === 'winner';
    const didSubmitKangarooBet = gameType !== 'kangaroo_race' || selectedChoice != null;
    const resolvedWinningSlot =
      gameType === 'kangaroo_race'
        ? (winningValue ?? (finishOrder.length > 0 ? finishOrder[0] : null))
        : null;
    const winLabel = gameType === 'kangaroo_race' ? labelForKangaroo(resolvedWinningSlot) : '';
    const rankLabel =
      finishRank == null
        ? 'Unknown'
        : finishRank === 1
          ? '1st'
          : finishRank === 2
            ? '2nd'
            : finishRank === 3
              ? '3rd'
              : `${finishRank}th`;

    return (
      <MobileFrame>
        <div className="flex flex-1 flex-col items-center justify-start p-4 sm:p-6 md:p-8">
          <div className="w-full max-w-sm text-center sm:max-w-md">
            {/* Title pill — “KANGAROO RACE !!” + finish rank, mirrored from the
                Figma screenshot. Always shows even when the player didn't lock
                a pick (rank fallback "—") so the result screen never collapses
                to just an icon. */}
            <div className="mb-4 rounded-xl border-2 border-[#00d8ff] bg-[linear-gradient(180deg,#3a04a6_0%,#1a0263_100%)] px-4 py-3 shadow-[0_0_22px_rgba(0,216,255,0.35)]">
              <h2 className="text-2xl font-black uppercase tracking-[0.06em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)] sm:text-3xl">
                KANGAROO RACE
              </h2>
              {finishRank != null && didSubmitKangarooBet ? (
                <p className="mt-1 text-base font-extrabold text-white sm:text-lg">
                  YOUR KANGAROO FINISHED <span className="text-[#39ff14]">{rankLabel}</span> !!
                </p>
              ) : (
                <p className="mt-1 text-base font-extrabold text-white/85 sm:text-lg">
                  RACE FINISHED
                </p>
              )}
            </div>

            {!didSubmitKangarooBet ? (
              <div className="mb-3 rounded-xl border-2 border-[#ffb020] bg-[linear-gradient(180deg,rgba(70,35,5,0.95),rgba(24,12,4,0.98))] px-4 py-3 shadow-[0_0_18px_rgba(255,176,32,0.28)]">
                <p className="text-xl font-black leading-snug text-[#ffd18a] sm:text-2xl">
                  YOU HAVE NOT SUBMITTED A BET
                </p>
              </div>
            ) : pointsEarned != null ? (
              <div className="mb-3 rounded-xl border-2 border-[#00f5ff] bg-[linear-gradient(180deg,rgba(13,24,60,0.95),rgba(4,10,25,0.98))] px-4 py-3 shadow-[0_0_18px_rgba(0,245,255,0.25)]">
                <p className="text-3xl font-black text-[#39ff14]">
                  YOU SCORED : +{pointsEarned} POINTS
                </p>
              </div>
            ) : null}

            <h2
              className={cn(
                'mb-3 text-2xl font-black sm:text-3xl',
                isWinner ? 'text-[#ffd700]' : 'text-foreground/70',
              )}
            ></h2>

            <div className="mx-auto mb-4 flex h-auto w-auto items-center justify-center rounded-2xl">
              <img
                src="/KangarooPic.png"
                alt="Kangaroo"
                className="h-full w-full object-contain"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = 'none';
                }}
              />
            </div>
          </div>
        </div>
      </MobileFrame>
    );
  }

  return (
    <MobileFrame>
      <div
        className={
          gameType === 'card_shuffle'
            ? 'relative flex min-h-0 flex-1 flex-col overflow-hidden'
            : 'relative flex flex-1 items-center justify-center p-4 sm:p-6 md:p-8'
        }
      >
        {roundAnnouncement && resultPhase !== 'finished' ? (
          <div
            className="pointer-events-none absolute inset-x-4 top-6 z-20 mx-auto max-w-md animate-fadeIn rounded-2xl border border-[#00d8ff]/60 bg-[linear-gradient(180deg,rgba(20,40,90,0.96)_0%,rgba(10,8,40,0.98)_100%)] px-4 py-3 text-center shadow-[0_0_24px_rgba(0,216,255,0.35)] sm:inset-x-8"
            role="status"
          >
            <p className="text-lg font-black text-white drop-shadow-sm sm:text-xl">
              {roundAnnouncement}
            </p>
          </div>
        ) : null}

        {gameType === 'kangaroo_race' &&
          resultPhase === null &&
          (() => {
            const buttonsDisabled = !roundOpen || selectedChoice !== null;
            return (
              <div className="relative z-10 flex min-h-0 flex-1 flex-col px-5 pb-8 pt-8 sm:px-8">
                <header className="shrink-0 text-center">
                  <h1 className="text-[clamp(1.65rem,6vw,2.2rem)] font-black uppercase leading-tight tracking-[0.06em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
                    KANGAROO RACE !!
                  </h1>
                  <p className="mt-2 text-[1.05rem] font-extrabold leading-tight text-white sm:text-xl">
                    SELECT YOUR KANGAROO
                  </p>
                </header>

                <div className="mx-auto mt-4 flex h-[170px] w-[170px] items-center justify-center rounded-2xl">
                  <img
                    src="/KangarooPic.png"
                    alt="Kangaroo"
                    className="h-full w-full object-contain"
                    onError={(e) => {
                      const el = e.currentTarget;
                      el.style.display = 'none';
                    }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {HORSES.map((horse) => (
                    <button
                      key={horse.id}
                      onClick={() => handleChoice(horse.id)}
                      disabled={buttonsDisabled}
                      className={cn(
                        'rounded-xl py-4 text-center text-5xl font-black text-white transition-all duration-200 active:translate-y-0.5 active:shadow-none',
                        horse.buttonClass,
                        selectedChoice === horse.id
                          ? 'ring-4 ring-white/55 scale-[1.02]'
                          : buttonsDisabled
                            ? 'opacity-40 saturate-75'
                            : 'hover:brightness-110 hover:scale-[1.02]',
                      )}
                    >
                      <div className="flex flex-col items-center px-2">
                        <span className="text-sm font-bold leading-tight sm:text-base">
                          {kangarooNames[horse.id - 1] || DEFAULT_KANGAROO_NAMES[horse.id - 1]}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-5 rounded-xl border border-[#00d8ff]/65 bg-[rgba(0,0,0,0.62)] px-4 py-3 text-center shadow-[0_0_12px_rgba(0,216,255,0.25)]">
                  <p className="text-base font-black text-white">
                    {selectedChoice
                      ? 'PICK LOCKED !!'
                      : !roundOpen
                        ? 'RACE STARTED — PICKS ARE CLOSED'
                        : KANGAROO_VENUE_FOOTER}
                  </p>
                  {selectedChoice ? (
                    <p className="mt-1 text-sm font-bold text-white/80">{KANGAROO_VENUE_FOOTER}</p>
                  ) : !roundOpen ? (
                    <p className="mt-1 text-sm font-bold text-white/80">
                      Watch the race on the venue screen
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })()}

        {gameType === 'card_shuffle' &&
          activeCardRound == null &&
          !roundOpen &&
          resultPhase === null && (
            // Pre-start screen — shown after the host loads Card Shuffle on the
            // venue but before they click "Start Game". Mirrors the Kangaroo
            // Race pre-race layout: big centered card art, round waiting copy
            // below the card, and a "Card Game is about to begin !!" pill.
            <div className="relative z-10 flex min-h-0 flex-1 flex-col px-5 pb-8 pt-10 sm:px-8">
              <header className="shrink-0 text-center">
                <h1 className="text-[clamp(1.75rem,6.4vw,2.35rem)] font-black uppercase leading-tight tracking-[0.06em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
                  CARD SHUFFLE !!
                </h1>
                <p className="mt-2 text-[1.1rem] font-extrabold leading-tight text-white sm:text-xl">
                  WHICH CARD IS THE QUEEN OF HEARTS ❤️
                </p>
              </header>

              <div className="flex flex-1 flex-col items-center justify-center py-4">
                <div className="flex h-[clamp(220px,48vh,340px)] w-[clamp(160px,36vh,245px)] items-center justify-center">
                  <img
                    src={CARD_IMAGE_QUEEN}
                    alt="Queen of Hearts"
                    className="h-full w-full object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)]"
                    onError={(e) => {
                      const el = e.currentTarget;
                      el.style.display = 'none';
                    }}
                  />
                </div>
                <div className="mt-4 rounded-xl border border-[#00d8ff]/65 bg-[rgba(0,0,0,0.62)] px-4 py-2.5 text-center shadow-[0_0_12px_rgba(0,216,255,0.25)]">
                  <p className="text-sm font-black text-white sm:text-base">
                    Waiting for Round 1 to start
                  </p>
                </div>
              </div>

              <div className="shrink-0 rounded-xl border border-[#00d8ff]/65 bg-[rgba(0,0,0,0.62)] px-4 py-3 text-center shadow-[0_0_12px_rgba(0,216,255,0.25)]">
                <p className="text-base font-black text-white sm:text-lg">
                  CARD GAME IS ABOUT TO BEGIN ON THE VENUE SCREEN!!
                </p>
              </div>
            </div>
          )}

        {gameType === 'card_shuffle' &&
          !(activeCardRound == null && !roundOpen && resultPhase === null) && (
            <div className="relative z-10 flex min-h-0 flex-1 flex-col px-5 pb-8 pt-10 sm:px-8">
              {resultPhase !== 'finished' ? (
                <header className="shrink-0 text-center">
                  <h1 className="text-[clamp(1.75rem,6vw,2.35rem)] font-black uppercase leading-tight tracking-[0.06em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
                    CARD SHUFFLE !!
                  </h1>
                  <p className="mt-3 text-base font-bold leading-snug text-white sm:text-lg">
                    WHICH CARD IS THE QUEEN OF HEARTS{' '}
                    <span className="inline-block" aria-hidden>
                      ❤️
                    </span>
                  </p>
                  <p className="mt-2 text-xs font-extrabold uppercase tracking-[0.14em] text-cyan-200/95 sm:text-sm">
                    {activeCardRound != null
                      ? `Round ${activeCardRound} running • Correct pick = +${activeRoundBonus}`
                      : 'Waiting for Round 1 to start'}
                  </p>
                </header>
              ) : null}

              {resultPhase !== 'finished' ? (
                <div
                  className={cn(
                    'mx-auto mt-6 w-full max-w-md shrink-0 rounded-xl border-2 bg-[rgba(7,15,35,0.92)] px-4 py-3 text-center shadow-[0_0_0_1px_rgba(34,211,238,0.15)]',
                    resultPhase === 'winner'
                      ? 'border-[#25d366] shadow-[0_0_18px_rgba(37,211,102,0.28)]'
                      : resultPhase === 'loser'
                        ? 'border-[#f87171] shadow-[0_0_16px_rgba(248,113,113,0.22)]'
                        : 'border-[#00d6ff]/80 shadow-[0_0_16px_rgba(0,214,255,0.24)]',
                  )}
                >
                  <p
                    className={cn(
                      'text-[0.95rem] font-black leading-snug sm:text-[1.05rem]',
                      resultPhase === 'winner'
                        ? 'text-[#39ff14]'
                        : resultPhase === 'loser'
                          ? 'text-[#ffb4b4]'
                          : 'text-white',
                    )}
                  >
                    {resultPhase === 'winner'
                      ? `CORRECT ! YOU FOUND THE QUEEN +${activeRoundBonus}`
                      : resultPhase === 'loser'
                        ? selectedChoice == null
                          ? winningValue
                            ? `NO PICK MADE — QUEEN WAS IN ${CARD_LABEL_MAP[winningValue]}`
                            : 'NO PICK MADE FOR THIS ROUND'
                          : winningValue && selectedChoice
                            ? `Wrong ! You picked ${CARD_LABEL_MAP[selectedChoice]} — Queen was in ${CARD_LABEL_MAP[winningValue]}`
                            : `Wrong ! Queen was in ${winningValue ? CARD_LABEL_MAP[winningValue] : 'ANOTHER'}`
                        : 'TAP A CARD TO MAKE YOUR SELECTION !!'}
                  </p>
                </div>
              ) : null}

              <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-6">
                {resultPhase === 'finished' ? (
                  <div className="mx-auto w-full max-w-md text-center">
                    <h2 className="text-[clamp(3.2rem,18vw,5.6rem)] font-black uppercase leading-[0.9] tracking-[0.05em] text-[#59d8ff] [text-shadow:0_0_0_rgb(0,0,0),0_2px_0_#0d4d89,0_0_18px_rgba(89,216,255,0.8)]">
                      GAME
                      <br />
                      OVER
                    </h2>
                    <p className="mt-8 text-[1.05rem] font-extrabold leading-snug text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
                      {CARD_FINISHED_MESSAGE}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mt-2 flex w-full max-w-md items-stretch justify-center gap-4 sm:gap-5">
                      {CARD_POSITIONS.map((pos) => {
                        const revealed = resultPhase != null;
                        const lockedPick = selectedChoice !== null;
                        const isSelected = selectedChoice === pos.id;
                        const isWinningPos =
                          winningValue != null && Number(winningValue) === pos.id;
                        const showRevealedFaces =
                          resultPhase === 'winner' || resultPhase === 'loser';
                        const cardSrc = showRevealedFaces
                          ? isWinningPos
                            ? CARD_IMAGE_QUEEN
                            : CARD_IMAGE_JOKER
                          : CARD_IMAGE_FACE_DOWN;

                        let cardFrameClass =
                          'border-white/90 shadow-[0_6px_18px_rgba(0,0,0,0.4)] opacity-95';
                        let labelClass = 'text-white';

                        if (!revealed) {
                          if (roundOpen && lockedPick && isSelected) {
                            cardFrameClass =
                              'border-[#33d9ff] shadow-[0_0_18px_rgba(51,217,255,0.95),0_0_35px_rgba(51,217,255,0.4)]';
                            labelClass = 'text-[#00d6ff]';
                          } else if (roundOpen && !lockedPick) {
                            cardFrameClass =
                              'border-white/95 shadow-[0_6px_18px_rgba(0,0,0,0.35)] hover:scale-[1.02] hover:brightness-110';
                          }
                        } else if (isWinningPos) {
                          cardFrameClass =
                            'border-[#35ff5a] shadow-[0_0_20px_rgba(53,255,90,0.9),0_0_38px_rgba(53,255,90,0.35)]';
                          labelClass = 'text-[#39ff14]';
                        } else if (lockedPick && isSelected) {
                          // Revealed: show the player's wrong choice distinctly from the queen slot.
                          cardFrameClass =
                            'border-[#ff4d6d] shadow-[0_0_18px_rgba(255,77,109,0.65),0_0_32px_rgba(255,77,109,0.25)]';
                          labelClass = 'text-[#ffb4c8]';
                        } else {
                          cardFrameClass = 'border-white/95 shadow-[0_6px_16px_rgba(0,0,0,0.35)]';
                        }

                        return (
                          <div
                            key={pos.id}
                            className={cn(
                              'flex min-w-0 flex-1 max-w-[108px] flex-col items-center transition-transform duration-400',
                              revealed && isWinningPos
                                ? 'z-10 scale-[1.1] animate-pulse sm:scale-[1.1]'
                                : revealed && lockedPick && isSelected && !isWinningPos
                                  ? 'z-9 scale-[1.04] sm:scale-[1.05]'
                                  : '',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => handleChoice(pos.id)}
                              disabled={!roundOpen || lockedPick || revealed}
                              className={cn(
                                'group relative mx-auto w-[86px] overflow-hidden rounded-[10px] border-2 transition-all duration-250 sm:w-[94px]',
                                'h-[132px] sm:h-[144px]',
                                !roundOpen || lockedPick || revealed
                                  ? 'cursor-default'
                                  : 'active:translate-y-0.5',
                                cardFrameClass,
                              )}
                              style={{ perspective: '900px' }}
                            >
                              <div
                                className="relative h-full w-full transition-transform duration-1500"
                                style={{
                                  transformStyle: 'preserve-3d',
                                  transform: showRevealedFaces
                                    ? 'rotateY(180deg)'
                                    : 'rotateY(0deg)',
                                }}
                              >
                                <img
                                  src={CARD_IMAGE_FACE_DOWN}
                                  alt={`${pos.label} card back`}
                                  className="absolute inset-0 h-full w-full object-contain align-top"
                                  style={{ backfaceVisibility: 'hidden' }}
                                  draggable={false}
                                />
                                <img
                                  src={cardSrc}
                                  alt={`${pos.label} card`}
                                  className="absolute inset-0 h-full w-full object-contain align-top transition-transform duration-300"
                                  style={{
                                    backfaceVisibility: 'hidden',
                                    transform: 'rotateY(180deg)',
                                  }}
                                  draggable={false}
                                />
                              </div>
                            </button>
                            <span
                              className={cn(
                                'mt-3 text-[1.05rem] font-black tracking-wide',
                                labelClass,
                              )}
                            >
                              {pos.label}
                            </span>
                            {revealed && lockedPick && isSelected ? (
                              <span
                                className={cn(
                                  'mt-1 rounded-full px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide',
                                  isWinningPos
                                    ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/50'
                                    : 'bg-rose-500/30 text-rose-100 ring-1 ring-rose-400/55',
                                )}
                              >
                                YOUR PICK
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    {resultPhase != null ? (
                      <p className="mt-4 max-w-md px-2 text-center text-xs font-medium text-white/45">
                        WAITING FOR THE HOST TO START THE NEXT ROUND...
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )}

        {!gameType && (
          <div className="text-center">
            <div className="text-4xl mb-3">MINI GAME</div>
            <h2 className="text-xl font-bold mb-2">Mini-Game</h2>
            <p className="text-foreground/50 text-sm mb-6">
              WAITING FOR THE HOST TO LAUNCH A GAME...
            </p>
            <Button variant="ghost" onClick={() => router.push('/play/game')}>
              BACK TO GAME
            </Button>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
