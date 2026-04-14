'use client';

import { useCallback, useEffect, useState } from 'react';
import { Unity, useUnityContext } from 'react-unity-webgl';

type UnityGameType = 'Kangaroo_race' | 'card_shuffle';

export interface MiniGameUnityCommand {
  id: number;
  game: 'card_shuffle';
  command: 'start_game' | 'next_round' | 'reveal_cards';
  roundNumber?: 1 | 2 | 3 | 4;
}

export interface UnityWrapperProps {
  gameType: UnityGameType;
  onPlayerAction?: (action: string, value: unknown) => void;
  onGameComplete?: (result: unknown) => void;
  onReady?: (gameType: UnityGameType) => void;
  command?: MiniGameUnityCommand | null;
  className?: string;
}

const GAME_CONFIGS: Record<string, { loaderUrl: string; dataUrl: string; frameworkUrl: string; codeUrl: string }> = {
  Kangaroo_race: {
    loaderUrl: '/games/Kangaroo-race/Build/Kangaroo-race.loader.js',
    dataUrl: '/games/Kangaroo-race/Build/Kangaroo-race.data',
    frameworkUrl: '/games/Kangaroo-race/Build/Kangaroo-race.framework.js',
    codeUrl: '/games/Kangaroo-race/Build/Kangaroo-race.wasm',
  },
  /** WebGL build served from repo root `CardGame/Build/` via `app/CardGame/Build/[...slug]/route.ts` */
  card_shuffle: {
    loaderUrl: '/CardGame/Build/Card%20Shuffle.loader.js?v=root-build-v2',
    dataUrl: '/CardGame/Build/Card%20Shuffle.data?v=root-build-v2',
    frameworkUrl: '/CardGame/Build/Card%20Shuffle.framework.js?v=root-build-v2',
    codeUrl: '/CardGame/Build/Card%20Shuffle.wasm?v=root-build-v2',
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

      const initialDelay = gameType === 'card_shuffle' ? 150 : 0;
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
              if (attempt < 3) sendWithRetry(attempt + 1);
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
          JSON.stringify({ type: 'MINIGAME_START', payload: config }),
        );
        return;
      }
      sendMessage('GameManager', 'StartGame', JSON.stringify(config));
    },
    [gameType, isLoaded, sendMessage, sendUnityMessageDeferred],
  );

  const resetGame = useCallback(() => {
    if (!isLoaded) return;
    if (gameType === 'card_shuffle') {
      sendUnityMessageDeferred(
        'GameManager',
        'OnMessageFromReact',
        JSON.stringify({ type: 'MINIGAME_NEXT_ROUND', payload: {} }),
      );
      return;
    }
    sendMessage('GameManager', 'ResetGame', '');
  }, [gameType, isLoaded, sendMessage, sendUnityMessageDeferred]);

  useEffect(() => {
    if (isLoaded && gameType !== 'card_shuffle') {
      startGame({ gameType, timestamp: Date.now() });
    }
  }, [isLoaded, gameType, startGame]);

  useEffect(() => {
    if (!isLoaded) return;

    const emitReady = () => {
      onReady?.(gameType);
    };
    const timer = window.setTimeout(emitReady, gameType === 'card_shuffle' ? 900 : 0);
    const interval =
      gameType === 'card_shuffle' ? window.setInterval(emitReady, 3000) : undefined;

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
    const payload =
      command.command === 'next_round' ? { roundNumber: command.roundNumber } : {};

    sendUnityMessageDeferred(
      'GameManager',
      'OnMessageFromReact',
      JSON.stringify({ type, payload }),
    );
  }, [command, gameType, isLoaded, sendUnityMessageDeferred]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isLoaded && loadingProgression === 0) {
        setLoadError(true);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [isLoaded, loadingProgression]);

  if (loadError && !isLoaded) {
    return (
      <FallbackView gameType={gameType} />
    );
  }

  return (
    <div className={`relative w-full h-full ${className || ''}`}>
      {/* Loading overlay */}
      {!isLoaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80">
          <div className="text-4xl mb-4">
            {gameType === 'Kangaroo_race' ? '🏇' : '🃏'}
          </div>
          <p className="text-lg font-semibold mb-3">Loading {gameType === 'Kangaroo_race' ? 'Kangaroo Race' : 'Card Shuffle'}</p>
          <div className="w-48 h-2 bg-surface-light rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${loadingProgression * 100}%` }}
            />
          </div>
          <p className="text-foreground/40 text-sm mt-2">{Math.round(loadingProgression * 100)}%</p>
        </div>
      )}

      <Unity
        unityProvider={unityProvider}
        className="w-full h-full"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

/**
 * Shown when Unity build files are not available (dev mode / placeholder).
 */
function FallbackView({ gameType }: { gameType: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 bg-surface/50 rounded-2xl border border-border">
      <div className="text-7xl">
        {gameType === 'Kangaroo_race' ? '🏇' : '🃏'}
      </div>
      <h3 className="text-3xl font-black">
        {gameType === 'Kangaroo_race' ? 'Kangaroo Race' : 'Card Shuffle'}
      </h3>
      <p className="text-foreground/40 max-w-md">
        Unity WebGL build not found. Place your build files at:
      </p>
      <code className="text-xs font-mono bg-surface-light px-4 py-2 rounded-lg text-primary">
        {gameType === 'Kangaroo_race'
          ? 'client/public/games/Kangaroo-race/Build/'
          : 'CardGame/Build/ (repo root, next to client/)'}
      </code>
      {gameType === 'card_shuffle' ? (
        <p className="text-xs text-foreground/40 max-w-md">
          Or set <code className="font-mono text-primary/80">CARDGAME_BUILD_DIR</code> to an absolute
          Build folder path on the server.
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
