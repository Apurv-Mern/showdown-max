'use client';

import { useCallback, useEffect, useState } from 'react';
import { Unity, useUnityContext } from 'react-unity-webgl';

type UnityGameType = 'Kangaroo_race' | 'card_shuffle';

export interface MiniGameUnityCommand {
  id: number;
  game: 'card_shuffle' | 'kangaroo_race';
  command: 'start_game' | 'next_round' | 'reveal_cards' | 'reveal_winner';
  roundNumber?: 1 | 2 | 3 | 4;
  kangarooNames?: string[];
}

export interface UnityWrapperProps {
  gameType: UnityGameType;
  onPlayerAction?: (action: string, value: unknown) => void;
  onGameComplete?: (result: unknown) => void;
  onReady?: (gameType: UnityGameType) => void;
  command?: MiniGameUnityCommand | null;
  className?: string;
}

function toCardUnityMessage(
  type: 'MINIGAME_START' | 'MINIGAME_NEXT_ROUND' | 'MINIGAME_REVEAL',
  payload: Record<string, unknown> = {},
): string {
  // Card build contract expects payload as a JSON string, not a nested object.
  return JSON.stringify({ type, payload: JSON.stringify(payload) });
}

function toKangarooUnityMessage(
  type: 'MINIGAME_START',
  payload: Record<string, unknown> = {},
): string {
  // Kangaroo build test harness uses Racemanager.OnMessageFromReact with payload as string.
  return JSON.stringify({ type, payload: JSON.stringify(payload) });
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
  });

  /* ─── Unity → Web: JSLib callbacks ─── */
  const handlePlayerAction = useCallback(
    (jsonPayload: string) => {
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
    [onPlayerAction],
  );

  const handleGameResult = useCallback(
    (jsonPayload: string) => {
      try {
        const data = JSON.parse(jsonPayload);
        onGameComplete?.(data);
      } catch {
        onGameComplete?.(jsonPayload);
      }
    },
    [onGameComplete],
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

    startGame({
      kangarooNames: Array.isArray(command.kangarooNames) ? command.kangarooNames : [],
      triggeredBy: 'host_start',
      timestamp: Date.now(),
    });
  }, [command, gameType, isLoaded, startGame]);

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
          <div className="mb-4 flex h-24 w-28 items-center justify-center sm:h-28 sm:w-32">
            {gameType === 'Kangaroo_race' ? (
              <img
                src="/KangarooPic.png"
                alt=""
                className="max-h-full w-full object-contain object-bottom"
              />
            ) : (
              <span className="text-4xl" aria-hidden>
                🃏
              </span>
            )}
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
      <div className="relative min-h-0 w-full flex-1 basis-0">
        <Unity
          unityProvider={unityProvider}
          className="absolute inset-0 h-full w-full max-h-full max-w-full"
          style={{ width: '100%', height: '100%' }}
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
      <div className="flex h-32 w-36 items-center justify-center sm:h-36 sm:w-40">
        {gameType === 'Kangaroo_race' ? (
          <img
            src="/KangarooPic.png"
            alt=""
            className="max-h-full w-full object-contain object-bottom"
          />
        ) : (
          <span className="text-7xl" aria-hidden>
            🃏
          </span>
        )}
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
