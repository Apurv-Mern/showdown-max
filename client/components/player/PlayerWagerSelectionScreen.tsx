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
    <div
      className="pointer-events-none absolute inset-0 bg-[#050017] bg-center bg-no-repeat"
      style={{
        backgroundImage: "url('/mobilebackground.png')",
        backgroundSize: '100% 100%',
      }}
      aria-hidden
    />
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
  return isFinalWagerRound ? 'FINAL WAGER' : 'WAGER';
}

function WagerSelectionView({
  category,
  isFinalWagerRound,
  wagerAmount,
  wagerChoiceValues,
  onSelectAmount,
  onSubmit,
}: {
  category?: string | null;
  isFinalWagerRound: boolean;
  wagerAmount: number;
  wagerChoiceValues: readonly number[];
  onSelectAmount: (amount: number) => void;
  onSubmit: () => void;
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
        <h1 className="text-[clamp(1.35rem,5.8vw,1.85rem)] font-black uppercase leading-tight tracking-[0.04em] text-[#1de8ff] drop-shadow-[0_0_14px_rgba(29,232,255,0.45)]">
          {toDisplayUpper(playerWagerTitle(isFinalWagerRound))}
        </h1>
        <p className="mx-auto mt-2 max-w-[18rem] text-[clamp(0.68rem,3vw,0.82rem)] font-bold uppercase leading-snug tracking-[0.06em] text-white sm:max-w-xs">
          {toDisplayUpper(playerWagerSubtitle(isFinalWagerRound))}
        </p>
      </header>

      <div className="mt-2 flex shrink-0 flex-col items-center sm:mt-2.5">
        <p className="text-[clamp(0.95rem,4vw,1.15rem)] font-black uppercase tracking-[0.12em] text-white">
          {categoryLabel}
        </p>
        <div
          className="mt-1.5 flex h-[clamp(5.75rem,23vw,7.25rem)] w-[clamp(5.75rem,23vw,7.25rem)] items-center justify-center rounded-full bg-black shadow-[0_0_28px_rgba(29,232,255,0.7)] ring-[3px] ring-[#1de8ff]"
          aria-live="polite"
          aria-label={`Selected wager ${formatWagerCircleValue(wagerAmount)}`}
        >
          <span className="text-[clamp(3.25rem,13vw,4.25rem)] font-black leading-none text-white">
            {formatWagerCircleValue(wagerAmount)}
          </span>
        </div>
      </div>

      <div className="mx-auto mt-6 flex w-full max-w-[min(20rem,90vw)] shrink-0 flex-col gap-2.5 sm:max-w-[22rem] sm:gap-3">
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
                'flex w-full items-center justify-center rounded-xl py-2.5',
                'text-[clamp(1.35rem,5.5vw,1.65rem)] font-black leading-none text-white touch-manipulation',
                'shadow-[inset_0_2px_0_rgba(255,255,255,0.28),0_4px_12px_rgba(0,0,0,0.4)] transition-all active:scale-[0.99]',
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

      <button
        type="button"
        onClick={onSubmit}
        className="mx-auto mt-5 w-full max-w-[min(20rem,90vw)] shrink-0 rounded-xl border-2 border-[#1de8ff] bg-[rgba(4,8,22,0.92)] px-4 py-3 text-[clamp(0.68rem,3vw,0.8rem)] font-black uppercase tracking-[0.1em] text-[#1de8ff] shadow-[0_0_16px_rgba(29,232,255,0.22)] transition-colors touch-manipulation active:bg-[rgba(8,16,40,0.95)] sm:max-w-[22rem]"
      >
        Submit Point Selection
      </button>
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
  onSubmit: () => void;
};

export function PlayerWagerSelectionScreen({
  category,
  isFinalWagerRound,
  wagerAmount,
  wagerSubmitted,
  wagerChoiceValues,
  onSelectAmount,
  onSubmit,
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
            onSubmit={onSubmit}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
