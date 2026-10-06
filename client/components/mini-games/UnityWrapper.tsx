'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Unity, useUnityContext } from 'react-unity-webgl';
import {
  formatKangarooTeamResponse,
  normalizeWinnerKangaroo,
} from '@/lib/kangarooRaceDefaults';

type UnityGameType = 'Kangaroo_race' | 'card_shuffle';

export interface MiniGameUnityCommand {
  id: number;
  game: 'card_shuffle' | 'kangaroo_race';
  command: 'start_game' | 'next_round' | 'reveal_cards' | 'reveal_winner';
  roundNumber?: 1 | 2 | 3 | 4;
  kangarooNames?: string[];
  teamResponse?: string;
  winnerKangaroo?: number;
}

export interface UnityWrapperProps {
  gameType: UnityGameType;
  onPlayerAction?: (action: string, value: unknown) => void;
  onGameComplete?: (result: unknown) => void;
  onReady?: (gameType: UnityGameType) => void;
  command?: MiniGameUnityCommand | null;
  /** Lineup + live pick total. Sent on Load (names + 0/N) and after each phone pick. */
  selectionUpdate?: {
    nonce: number;
    totalSelected: number;
    totalTeams: number;
    pickCounts: Record<string, number>;
    kangarooNames?: string[];
  } | null;
  className?: string;
}

function toCardUnityMessage(
  type: 'MINIGAME_START' | 'MINIGAME_NEXT_ROUND' | 'MINIGAME_REVEAL' | 'SELECTION_COUNT',
  payload: Record<string, unknown> = {},
): string {
  // Card build contract expects payload as a JSON string, not a nested object.
  return JSON.stringify({ type, payload: JSON.stringify(payload) });
}

function toKangarooUnityMessage(
  type: 'MINIGAME_START' | 'SELECTION_COUNT',
  payload: Record<string, unknown> = {},
): string {
  // Official contract: payload is a JSON string, not a nested object.
  return JSON.stringify({ type, payload: JSON.stringify(payload) });
}

function parseUnityEnvelope(raw: unknown): { type: string; payload: unknown } | null {
  const unwrap = (value: unknown, depth = 0): Record<string, unknown> | null => {
    if (depth > 6 || value == null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      try {
        return unwrap(JSON.parse(trimmed), depth + 1);
      } catch {
        return null;
      }
    }
    return typeof value === 'object' ? (value as Record<string, unknown>) : null;
  };

  const root = unwrap(raw);
  if (!root) return null;
  const type = String(root.type || root.action || '').toUpperCase();
  if (!type) return null;
  return { type, payload: root.payload !== undefined ? root.payload : root };
}

const GAME_CONFIGS: Record<
  string,
  { loaderUrl: string; dataUrl: string; frameworkUrl: string; codeUrl: string }
> = {
  Kangaroo_race: {
    loaderUrl: '/KangarooGame/Build/kangaroofinal.loader.js',
    dataUrl: '/KangarooGame/Build/kangaroofinal.data.br',
    frameworkUrl: '/KangarooGame/Build/kangaroofinal.framework.js.br',
    codeUrl: '/KangarooGame/Build/kangaroofinal.wasm.br',
  },
  /** WebGL build served from repo root `CardGame/Build/` via `app/CardGame/Build/[...slug]/route.ts` */
  card_shuffle: {
    loaderUrl: '/CardGame/Build/Card%20Shuffle.loader.js',
    dataUrl: '/CardGame/Build/Card%20Shuffle.data.br',
    frameworkUrl: '/CardGame/Build/Card%20Shuffle.framework.js.br',
    codeUrl: '/CardGame/Build/Card%20Shuffle.wasm.br',
  },
};

/**
 * Wraps a Unity WebGL build with react-unity-webgl.
 *
 * JSLib bridge contract (Unity C# → JS):
 *   - `SendPlayerAction(string jsonPayload)` called from Unity when a player makes a choice
 *   - `SendGameResult(string jsonPayload)` called when the mini-game reports reveal/result data
 *
 * Web → Unity (via SendMessage):
 *   - `GameManager.StartGame(jsonConfig)` to initialise with team data
 *   - `GameManager.ResetGame()` to reset state for replay
 *   - `Racemanager.OnMessageFromReact(jsonPayload)` for Kangaroo start trigger
 */
export default function UnityWrapper({
  gameType,
  onPlayerAction,
  onGameComplete,
  onReady,
  command,
  selectionUpdate = null,
  className,
}: UnityWrapperProps) {
  const config = GAME_CONFIGS[gameType];
  const [loadError, setLoadError] = useState(false);

  const {
    unityProvider,
    sendMessage,
    isLoaded,
    loadingProgression,
    addEventListener,
    removeEventListener,
    unload,
  } = useUnityContext({
    ...config,
    productName: gameType === 'Kangaroo_race' ? 'Kangaroo Race' : 'Card Shuffle',
    companyName: 'MaxShowdown',
    // Avoid stale .wasm/.data from UnityCache on the second visit (Kangaroo + Card Shuffle).
    cacheControl: () => 'no-store',
  });

  // Unity shows a blocking alert for a harmless transient SendMessage error on cached reloads.
  // Suppress only that case — no layout or timing changes.
  useEffect(() => {
    const nativeAlert = window.alert.bind(window);
    window.alert = (message?: unknown) => {
      const text = String(message ?? '');
      if (
        text.includes('An error occurred running the Unity content') &&
        /null function|SendMessage|Player not loaded yet/i.test(text)
      ) {
        console.warn('[UnityWrapper] Suppressed transient Unity alert');
        return;
      }
      nativeAlert(message);
    };
    return () => {
      window.alert = nativeAlert;
    };
  }, []);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const selectionUpdateRef = useRef(selectionUpdate);
  selectionUpdateRef.current = selectionUpdate;
  const pushLineupRef = useRef<() => void>(() => {});

  /* ─── Unity → Web: JSLib callbacks ─── */
  const handlePlayerAction = useCallback(
    (jsonPayload: string) => {
      const envelope = parseUnityEnvelope(jsonPayload);
      if (envelope?.type === 'MINIGAME_READY') {
        onReadyRef.current?.(gameType);
        onPlayerAction?.('MINIGAME_READY', envelope.payload ?? {});
        pushLineupRef.current();
        return;
      }
      try {
        const data = JSON.parse(jsonPayload);
        const action =
          typeof data?.action === 'string'
            ? data.action
            : typeof data?.type === 'string'
              ? data.type
              : 'raw';
        const value =
          data?.value !== undefined
            ? data.value
            : data?.payload !== undefined
              ? data.payload
              : data;
        onPlayerAction?.(action, value);
      } catch {
        onPlayerAction?.('raw', jsonPayload);
      }
    },
    [gameType, onPlayerAction],
  );

  const handleGameResult = useCallback(
    (jsonPayload: string) => {
      const envelope = parseUnityEnvelope(jsonPayload);
      if (envelope?.type === 'MINIGAME_READY') {
        onReadyRef.current?.(gameType);
        onGameComplete?.({ type: 'MINIGAME_READY', payload: envelope.payload ?? {} });
        pushLineupRef.current();
        return;
      }
      try {
        const data = JSON.parse(jsonPayload);
        onGameComplete?.(data);
      } catch {
        onGameComplete?.(jsonPayload);
      }
    },
    [gameType, onGameComplete],
  );

  useEffect(() => {
    addEventListener('SendPlayerAction', handlePlayerAction);
    addEventListener('SendGameResult', handleGameResult);
    return () => {
      removeEventListener('SendPlayerAction', handlePlayerAction);
      removeEventListener('SendGameResult', handleGameResult);
    };
  }, [addEventListener, removeEventListener, handlePlayerAction, handleGameResult]);

  useEffect(() => {
    if (gameType !== 'Kangaroo_race') return;
    const onBridgeReady = (event: MessageEvent) => {
      const envelope = parseUnityEnvelope(event.data);
      if (envelope?.type !== 'MINIGAME_READY') return;
      onReadyRef.current?.(gameType);
      pushLineupRef.current();
    };
    window.addEventListener('message', onBridgeReady);
    return () => window.removeEventListener('message', onBridgeReady);
  }, [gameType]);

  useEffect(() => {
    return () => {
      unload().catch(() => {});
    };
  }, [unload]);

  /* ─── Web → Unity: public commands ─── */
  const sendUnityMessageDeferred = useCallback(
    (objectName: string, methodName: string, message: string) => {
      if (!isLoaded) return;

      // The Kangaroo build reports WebGL loaded before Racemanager is always ready to receive
      // SendMessage. A short delay plus extra retries avoids the venue-side error that sometimes
      // appeared immediately after the host clicked Start Race.
      const initialDelay = gameType === 'card_shuffle' ? 150 : 350;
      const sendWithRetry = (attempt: number) => {
        window.setTimeout(
          () => {
            try {
              sendMessage(objectName, methodName, message);
            } catch (error) {
              console.warn('[UnityWrapper] SendMessage failed', {
                gameType,
                objectName,
                methodName,
                attempt,
                error,
              });
              if (attempt < 6) sendWithRetry(attempt + 1);
            }
          },
          attempt === 1 ? initialDelay : 450,
        );
      };

      sendWithRetry(1);
    },
    [gameType, isLoaded, sendMessage],
  );

  const pushSelectionCountToUnity = useCallback(() => {
    if (!isLoaded) return;
    const sel = selectionUpdateRef.current;
    if (!sel) return;
    const selected = Number(sel?.totalSelected || 0);
    const teams = Number(sel?.totalTeams || 0);
    const countPayload = {
      teamResponse: formatKangarooTeamResponse(selected, teams),
      totalSelected: selected,
      totalTeams: teams,
      pickCounts: sel?.pickCounts ?? {},
      timestamp: Date.now(),
    };

    if (gameType === 'Kangaroo_race') {
      const names = Array.isArray(sel?.kangarooNames) ? sel.kangarooNames : [];
      sendUnityMessageDeferred(
        'Racemanager',
        'OnMessageFromReact',
        toKangarooUnityMessage('SELECTION_COUNT', {
          kangarooNames: names,
          ...countPayload,
        }),
      );
      return;
    }

    if (gameType === 'card_shuffle') {
      sendUnityMessageDeferred(
        'GameManager',
        'OnMessageFromReact',
        toCardUnityMessage('SELECTION_COUNT', countPayload),
      );
    }
  }, [gameType, isLoaded, sendUnityMessageDeferred]);

  pushLineupRef.current = pushSelectionCountToUnity;

  const startGame = useCallback(
    (config: Record<string, unknown>) => {
      if (!isLoaded) return;
      if (gameType === 'card_shuffle') {
        sendUnityMessageDeferred(
          'GameManager',
          'OnMessageFromReact',
          toCardUnityMessage('MINIGAME_START', config),
        );
        return;
      }

      if (gameType === 'Kangaroo_race') {
        sendUnityMessageDeferred(
          'Racemanager',
          'OnMessageFromReact',
          toKangarooUnityMessage('MINIGAME_START', config),
        );
      }
    },
    [gameType, isLoaded, sendUnityMessageDeferred],
  );

  const resetGame = useCallback(() => {
    if (!isLoaded) return;
    if (gameType === 'card_shuffle') {
      sendUnityMessageDeferred(
        'GameManager',
        'OnMessageFromReact',
        toCardUnityMessage('MINIGAME_NEXT_ROUND', {}),
      );
    }
  }, [gameType, isLoaded, sendUnityMessageDeferred]);

  useEffect(() => {
    if (!isLoaded) return;

    const emitReady = () => {
      onReady?.(gameType);
    };
    const timer = window.setTimeout(emitReady, gameType === 'card_shuffle' ? 900 : 1200);
    const interval = window.setInterval(emitReady, 3000);

    return () => {
      window.clearTimeout(timer);
      if (interval) window.clearInterval(interval);
    };
  }, [gameType, isLoaded, onReady]);

  useEffect(() => {
    if (!isLoaded || gameType !== 'card_shuffle' || !command || command.game !== 'card_shuffle') {
      return;
    }

    const type =
      command.command === 'start_game'
        ? 'MINIGAME_START'
        : command.command === 'reveal_cards'
          ? 'MINIGAME_REVEAL'
          : 'MINIGAME_NEXT_ROUND';
    const payload = command.command === 'next_round' ? { roundNumber: command.roundNumber } : {};

    sendUnityMessageDeferred(
      'GameManager',
      'OnMessageFromReact',
      toCardUnityMessage(type, payload),
    );
  }, [command, gameType, isLoaded, sendUnityMessageDeferred]);

  useEffect(() => {
    if (!isLoaded || gameType !== 'Kangaroo_race' || !command || command.game !== 'kangaroo_race') {
      return;
    }

    if (command.command !== 'start_game') return;

    const latestSelection = selectionUpdateRef.current;
    const selected = Number(latestSelection?.totalSelected || 0);
    const teams = Number(latestSelection?.totalTeams || 0);
    startGame({
      kangarooNames: Array.isArray(command.kangarooNames) ? command.kangarooNames : [],
      teamResponse:
        typeof command.teamResponse === 'string' && command.teamResponse.trim()
          ? command.teamResponse.trim()
          : formatKangarooTeamResponse(selected, teams),
      winnerKangaroo: normalizeWinnerKangaroo(command.winnerKangaroo),
    });
  }, [command, gameType, isLoaded, startGame]);

  useEffect(() => {
    if (!isLoaded || !selectionUpdate) return;
    if (gameType !== 'Kangaroo_race' && gameType !== 'card_shuffle') return;
    pushSelectionCountToUnity();
  }, [gameType, isLoaded, selectionUpdate, pushSelectionCountToUnity]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isLoaded && loadingProgression === 0) {
        setLoadError(true);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [isLoaded, loadingProgression]);

  if (loadError && !isLoaded) {
    return <FallbackView gameType={gameType} />;
  }

  return (
    <div
      className={`relative flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden bg-black ${className || ''}`}
    >
      {/* Loading overlay */}
      {!isLoaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80">
          <div className="mb-4 flex h-60 w-[17.5rem] items-center justify-center sm:h-[17.5rem] sm:w-80">
            <img
              src="/logo.png"
              alt="Max Showdown"
              className="max-h-full w-full object-contain"
            />
          </div>
          <p className="text-lg font-semibold mb-3">
            Loading {gameType === 'Kangaroo_race' ? 'Kangaroo Race' : 'Card Shuffle'}
          </p>
          <div className="w-48 h-2 bg-surface-light rounded-full ">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${loadingProgression * 100}%` }}
            />
          </div>
          <p className="text-foreground/40 text-sm mt-2">{Math.round(loadingProgression * 100)}%</p>
        </div>
      )}

      {/* Slot fills the black host; canvas is absolutely stretched so it matches the box bounds
          (no inner letterboxing below the WebGL view). */}
      <div className="absolute inset-0 h-full w-full">
        <Unity
          unityProvider={unityProvider}
          className="absolute inset-0 block h-full w-full"
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    </div>
  );
}

/**
 * Shown when Unity build files are not available (dev mode / placeholder).
 */
function FallbackView({ gameType }: { gameType: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 bg-surface/50 rounded-2xl border border-border">
      <div className="flex h-80 w-[22.5rem] items-center justify-center sm:h-[22.5rem] sm:w-[25rem]">
        <img
          src="/logo.png"
          alt="Max Showdown"
          className="max-h-full w-full object-contain"
        />
      </div>
      <h3 className="text-3xl font-black">
        {gameType === 'Kangaroo_race' ? 'Kangaroo Race' : 'Card Shuffle'}
      </h3>
      <p className="text-foreground/40 max-w-md">
        Unity WebGL build not found. Place your build files at:
      </p>
      <code className="text-xs font-mono bg-surface-light px-4 py-2 rounded-lg text-primary">
        {gameType === 'Kangaroo_race'
          ? 'KangarooGamebb/Build/ (repo root, next to client/)'
          : 'CardGame/Build/ (repo root, next to client/)'}
      </code>
      {gameType === 'card_shuffle' || gameType === 'Kangaroo_race' ? (
        <p className="text-xs text-foreground/40 max-w-md">
          Or set{' '}
          <code className="font-mono text-primary/80">
            {gameType === 'Kangaroo_race' ? 'KANGAROO_BUILD_DIR' : 'CARDGAME_BUILD_DIR'}
          </code>{' '}
          to an absolute Build folder path on the server.
        </p>
      ) : null}
      <div className="mt-4 bg-primary/10 border border-primary/20 rounded-xl px-6 py-3">
        <p className="text-sm text-foreground/50">
          Required files: <span className="text-foreground/70">.loader.js</span>,{' '}
          <span className="text-foreground/70">.data</span>,{' '}
          <span className="text-foreground/70">.framework.js</span>,{' '}
          <span className="text-foreground/70">.wasm</span>
        </p>
      </div>
    </div>
  );
}

export { FallbackView };
export type { UnityWrapperProps as UnityConfig };
