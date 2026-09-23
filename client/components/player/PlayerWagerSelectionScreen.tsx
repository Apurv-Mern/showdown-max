'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn, toDisplayUpper } from '@/lib/utils';
import { LoadingDots } from '@/app/play/LoadingDots';
import {
  FINAL_WAGER_GRID,
  FINAL_WAGER_PERCENT_OPTIONS,
  formatWagerButtonLabel,
  formatWagerCircleValue,
  playerWagerSubtitle,
  playerWagerTitle,
  STANDARD_WAGER_GRID,
  tileClassForWagerValue,
  WAGER_POINT_OPTIONS,
} from '@/lib/wagerGrid';

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

const SELECTED_BUTTON =
  'ring-[2.5px] ring-[#1de8ff] shadow-[0_0_18px_rgba(29,232,255,0.75)] scale-[1.01]';

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
      className="relative z-10 flex min-h-0 w-full flex-1 flex-col px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6"
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
          className="text-[40px] font-extrabold uppercase leading-none text-white"
          style={{ textShadow: '0 0 6px #0010FF' }}
        >
          YOUR BET
        </p>
        <div
          className="mt-3 flex size-[160px] items-center justify-center rounded-full"
          style={{
            background: 'radial-gradient(circle, #1A00FF 20%, #000010 70%, #040040 100%)',
            boxShadow: '0 0 18px #00D9FF',
            border: '2px solid #00D9FF',
          }}
          aria-live="polite"
          aria-label={`Selected wager ${formatWagerCircleValue(wagerAmount)} ${categoryLabel}`}
        >
          <span className="text-[60px] font-black leading-none text-white">
            {formatWagerCircleValue(wagerAmount)}
          </span>
        </div>
      </div>

      <div className="mx-auto mt-6 flex w-full max-w-[400px] shrink-0 flex-col gap-5">
        {gridValues.map((value) => {
          const enabled = wagerChoiceValues.includes(value);
          const selected = wagerAmount === value;
          return (
            <button
              key={value}
              type="button"
              disabled={!enabled}
              onClick={() => onSelectAmount(value)}
              className={cn(
                'flex h-[65px] w-full items-center justify-center rounded-full',
                'text-[45px] font-extrabold leading-none text-white touch-manipulation',
                '[text-shadow:0_4px_4px_rgba(0,0,0,0.7)] transition-all active:scale-[0.99]',
                tileClassForWagerValue(value, isFinalWagerRound),
                !enabled && 'pointer-events-none opacity-40',
                selected && SELECTED_BUTTON,
              )}
            >
              {formatWagerButtonLabel(value, isFinalWagerRound)}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

function WagerLockedView({
  category,
  wagerAmount,
  isFinalWagerRound,
}: {
  category?: string | null;
  wagerAmount: number;
  isFinalWagerRound: boolean;
}) {
  const categoryLabel = resolveWagerCategoryLabel(category, isFinalWagerRound);
  return (
    <motion.div
      key="wager-locked"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="relative z-10 flex w-full flex-1 flex-col items-center justify-center px-5 pb-10 pt-10 sm:px-6"
    >
      <p className="text-[clamp(0.95rem,4vw,1.1rem)] font-black uppercase tracking-[0.1em] text-[#1de8ff]">
        {categoryLabel}
      </p>
      <div className="mt-3 flex h-[clamp(6.5rem,26vw,8.25rem)] w-[clamp(6.5rem,26vw,8.25rem)] items-center justify-center rounded-full bg-black shadow-[0_0_28px_rgba(29,232,255,0.7)] ring-[3px] ring-[#1de8ff]">
        <span className="text-[clamp(3.25rem,13vw,4.25rem)] font-black leading-none text-white">
          {formatWagerCircleValue(wagerAmount)}
        </span>
      </div>

      <p className="mt-8 text-center text-[clamp(0.9rem,4vw,1.05rem)] font-black uppercase tracking-[0.06em] text-[#47eaff] drop-shadow-[0_0_12px_rgba(71,234,255,0.35)]">
        Points Are Locked In !!
      </p>

      <div className="mt-5 w-full max-w-[min(16rem,78vw)] rounded-full bg-linear-to-b from-[#ff2b2b] via-[#c40012] to-[#7a0010] px-4 py-3.5 text-center shadow-[inset_0_2px_0_rgba(255,255,255,0.28),0_8px_22px_rgba(0,0,0,0.45)] sm:max-w-[17rem]">
        <p className="text-[clamp(0.68rem,3vw,0.82rem)] font-black uppercase tracking-[0.05em] text-white">
          Your Selected Points : {isFinalWagerRound ? `${wagerAmount}%` : `${wagerAmount} Pts`}
        </p>
      </div>

      <LoadingDots variant="sequential" className="mt-10" gapClass="gap-2.5" />
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
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <PlayerWagerBackground />
      <AnimatePresence mode="wait">
        {wagerSubmitted ? (
          <WagerLockedView
            category={category}
            wagerAmount={wagerAmount}
            isFinalWagerRound={isFinalWagerRound}
          />
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
