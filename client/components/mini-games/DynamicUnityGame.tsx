'use client';

import dynamic from 'next/dynamic';
import type { UnityWrapperProps } from './UnityWrapper';

/**
 * Lazy-loaded Unity game component.
 * SSR disabled — Unity WebGL can only run in the browser.
 */
const DynamicUnityGame = dynamic<UnityWrapperProps>(
  () => import('./UnityWrapper'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-surface/50 rounded-2xl">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-foreground/40">Preparing mini-game...</p>
        </div>
      </div>
    ),
  },
);

export default DynamicUnityGame;
