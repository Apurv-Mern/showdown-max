'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { toDisplayUpper } from '@/lib/utils';
import {
  FINAL_WAGER_GRID,
  FINAL_WAGER_PERCENT_OPTIONS,
  formatWagerButtonLabel,
  formatWagerCircleValue,
  playerWagerSubtitle,
  playerWagerTitle,
  STANDARD_WAGER_GRID,
  WAGER_POINT_OPTIONS,
} from '@/lib/wagerGrid';
import { PlayerWagerChoiceButton } from '@/components/player/PlayerWagerChoiceButton';
import { PlayerWagerLockedView } from '@/components/player/PlayerWagerLockedView';

export { WAGER_POINT_OPTIONS, FINAL_WAGER_PERCENT_OPTIONS };

function PlayerWagerBackground() {
  return (
    <div className="player-figma-bg pointer-events-none absolute inset-0" aria-hidden>
      <img
        src="/figma/player-dot-halo.png"
        alt=""
        className="absolute left-1/2 top-[81%] h-[46%] w-[99%] -translate-x-1/2 object-contain object-bottom opacity-10"
      />
    </div>
  );
}

function resolveWagerCategoryLabel(
  category: string | null | undefined,
  isFinalWagerRound: boolean,
): string {
  const trimmed = (category || '').trim();
  if (trimmed) return toDisplayUpper(trimmed);
  return isFinalWagerRound ? 'QUESTIONS' : 'WAGER';
}

function WagerSelectionView({
  category,
  isFinalWagerRound,
  wagerAmount,
  wagerChoiceValues,
  onSelectAmount,
}: {
  category?: string | null;
  isFinalWagerRound: boolean;
  wagerAmount: number;
  wagerChoiceValues: readonly number[];
  onSelectAmount: (amount: number) => void;
}) {
  const gridValues = isFinalWagerRound ? FINAL_WAGER_GRID : STANDARD_WAGER_GRID;
  const categoryLabel = resolveWagerCategoryLabel(category, isFinalWagerRound);

  return (
    <motion.div
      key="wager-select"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="relative z-10 flex min-h-0 w-full max-w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6"
    >
      <header className="shrink-0 text-center">
        <h1 className="text-[25px] font-extrabold uppercase leading-[0.7] text-white">
          {toDisplayUpper(playerWagerTitle(isFinalWagerRound))}
        </h1>
        <p className="mx-auto mt-4 max-w-[389px] text-[18px] font-extrabold uppercase leading-[1.1] text-white">
          {toDisplayUpper(playerWagerSubtitle(isFinalWagerRound))}
        </p>
      </header>

      <div className="mt-4 flex shrink-0 flex-col items-center">
        <p
          className="text-[30px] font-extrabold uppercase leading-none text-white"
          style={{ textShadow: '0 0 6px #0010FF' }}
        >
          {categoryLabel}
        </p>
        <div
          className="mt-3 flex size-[clamp(7.5rem,38vw,10rem)] items-center justify-center rounded-full"
          style={{
            background: 'radial-gradient(circle, #1A00FF 20%, #000010 70%, #040040 100%)',
            boxShadow: '0 0 18px #00D9FF',
            border: '2px solid #00D9FF',
          }}
          aria-live="polite"
          aria-label={`Selected wager ${formatWagerCircleValue(wagerAmount)} ${categoryLabel}`}
        >
          <span className="text-[clamp(2.75rem,14vw,3.75rem)] font-black leading-none text-white">
            {formatWagerCircleValue(wagerAmount)}
          </span>
        </div>
      </div>

      <div
        className="mt-6 min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] px-2"
        aria-label="Wager amount options"
      >
        <div className="mx-auto flex w-full max-w-[360px] flex-col gap-4 px-2 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {gridValues.map((value, index) => {
            const enabled = wagerChoiceValues.includes(value);
            const selected = wagerAmount === value;
            return (
              <PlayerWagerChoiceButton
                key={value}
                index={index}
                label={formatWagerButtonLabel(value, isFinalWagerRound)}
                selected={selected}
                disabled={!enabled}
                onClick={() => onSelectAmount(value)}
              />
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

export type PlayerWagerSelectionScreenProps = {
  category?: string | null;
  isFinalWagerRound: boolean;
  wagerAmount: number;
  wagerSubmitted: boolean;
  wagerChoiceValues: readonly number[];
  onSelectAmount: (amount: number) => void;
};

export function PlayerWagerSelectionScreen({
  category,
  isFinalWagerRound,
  wagerAmount,
  wagerSubmitted,
  wagerChoiceValues,
  onSelectAmount,
}: PlayerWagerSelectionScreenProps) {
  return (
    <div className="relative flex h-full min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden">
      <PlayerWagerBackground />
      <AnimatePresence mode="wait">
        {wagerSubmitted ? (
          <PlayerWagerLockedView wagerAmount={wagerAmount} isFinalWagerRound={isFinalWagerRound} />
        ) : (
          <WagerSelectionView
            category={category}
            isFinalWagerRound={isFinalWagerRound}
            wagerAmount={wagerAmount}
            wagerChoiceValues={wagerChoiceValues}
            onSelectAmount={onSelectAmount}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
