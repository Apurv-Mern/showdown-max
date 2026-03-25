'use client';

import { useCallback, useEffect, useState } from 'react';
import { Unity, useUnityContext } from 'react-unity-webgl';

export interface UnityWrapperProps {
  gameType: 'horse_race' | 'card_shuffle';
  onPlayerAction?: (action: string, value: unknown) => void;
  onGameComplete?: (result: unknown) => void;
  className?: string;
}

const GAME_CONFIGS: Record<string, { loaderUrl: string; dataUrl: string; frameworkUrl: string; codeUrl: string }> = {
  horse_race: {
    loaderUrl: '/games/horse-race/Build/horse-race.loader.js',
    dataUrl: '/games/horse-race/Build/horse-race.data',
    frameworkUrl: '/games/horse-race/Build/horse-race.framework.js',
    codeUrl: '/games/horse-race/Build/horse-race.wasm',
  },
  /** WebGL build from repo `CardGame/` → copied to `client/public/CardGame/Build/` */
  card_shuffle: {
    loaderUrl: '/CardGame/Build/CardGame.loader.js',
    dataUrl: '/CardGame/Build/CardGame.data.br',
    frameworkUrl: '/CardGame/Build/CardGame.framework.js.br',
    codeUrl: '/CardGame/Build/CardGame.wasm.br',
  },
};

/**
 * Wraps a Unity WebGL build with react-unity-webgl.
 *
 * JSLib bridge contract (Unity C# → JS):
 *   - `SendPlayerAction(string jsonPayload)` called from Unity when a player makes a choice
 *   - `SendGameResult(string jsonPayload)` called when the mini-game finishes
 *
 * Web → Unity (via SendMessage):
 *   - `GameManager.StartGame(jsonConfig)` to initialise with team data
 *   - `GameManager.ResetGame()` to reset state for replay
 */
export default function UnityWrapper({ gameType, onPlayerAction, onGameComplete, className }: UnityWrapperProps) {
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
    productName: gameType === 'horse_race' ? 'Horse Race' : 'Card Shuffle',
    companyName: 'MaxShowdown',
  });

  /* ─── Unity → Web: JSLib callbacks ─── */
  const handlePlayerAction = useCallback(
    (jsonPayload: string) => {
      try {
        const data = JSON.parse(jsonPayload);
        onPlayerAction?.(data.action, data.value);
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
  const startGame = useCallback(
    (config: Record<string, unknown>) => {
      if (!isLoaded) return;
      sendMessage('GameManager', 'StartGame', JSON.stringify(config));
    },
    [isLoaded, sendMessage],
  );

  const resetGame = useCallback(() => {
    if (!isLoaded) return;
    sendMessage('GameManager', 'ResetGame', '');
  }, [isLoaded, sendMessage]);

  useEffect(() => {
    if (isLoaded) {
      startGame({ gameType, timestamp: Date.now() });
    }
  }, [isLoaded, gameType, startGame]);

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
            {gameType === 'horse_race' ? '🏇' : '🃏'}
          </div>
          <p className="text-lg font-semibold mb-3">Loading {gameType === 'horse_race' ? 'Horse Race' : 'Card Shuffle'}</p>
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
        {gameType === 'horse_race' ? '🏇' : '🃏'}
      </div>
      <h3 className="text-3xl font-black">
        {gameType === 'horse_race' ? 'Horse Race' : 'Card Shuffle'}
      </h3>
      <p className="text-foreground/40 max-w-md">
        Unity WebGL build not found. Place your build files at:
      </p>
      <code className="text-xs font-mono bg-surface-light px-4 py-2 rounded-lg text-primary">
        {gameType === 'horse_race' ? '/public/games/horse-race/Build/' : '/public/CardGame/Build/'}
      </code>
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
