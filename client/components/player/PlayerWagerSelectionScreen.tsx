'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn, toDisplayUpper } from '@/lib/utils';
import { LoadingDots } from '@/app/play/LoadingDots';
import {
  FINAL_WAGER_GRID,
  FINAL_WAGER_PERCENT_OPTIONS,
  formatWagerGridLabel,
  STANDARD_WAGER_GRID,
  tileClassForWagerValue,
  wagerInstructionText,
  WAGER_POINT_OPTIONS,
} from '@/lib/wagerGrid';

export { WAGER_POINT_OPTIONS, FINAL_WAGER_PERCENT_OPTIONS };

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
  const headline = category
    ? toDisplayUpper(category)
    : isFinalWagerRound
      ? 'FINAL WAGER'
      : 'WAGER ROUND';

  return (
    <motion.div
      key="wager-select"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="relative z-10 flex w-full max-w-[min(26rem,94vw)] flex-col px-4 pb-8 pt-6 sm:max-w-md sm:px-5 sm:pb-10 sm:pt-8"
    >
      <div
        className={cn(
          'flex w-full flex-col rounded-[22px] border-2 border-[#e8eef5]/80',
          'bg-linear-to-b from-[#1c208f] via-[#14185a] to-[#060612]',
          'px-4 py-6 shadow-[0_0_32px_rgba(0,80,180,0.35)] sm:px-5 sm:py-7',
        )}
      >
        <div className="text-center">
          <h1
            className="text-[clamp(2.25rem,9vw,3.5rem)] font-black uppercase leading-[0.9] tracking-[0.02em] drop-shadow-[0_3px_0_rgba(0,60,140,0.55),0_0_18px_rgba(71,234,255,0.4)]"
            style={{
              background:
                'linear-gradient(180deg, #6BF8FF 0%, #47EAFF 35%, #00D9FF 65%, #3AC1FF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {headline}
          </h1>
          <p className="mt-4 text-[clamp(0.72rem,3.2vw,0.95rem)] font-bold uppercase leading-snug tracking-[0.08em] text-white sm:mt-5">
            {wagerInstructionText(isFinalWagerRound)}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:gap-3">
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
                  'flex min-h-[clamp(3.5rem,14vw,4.75rem)] items-center justify-center rounded-xl',
                  'text-[clamp(1.65rem,6.5vw,2.35rem)] font-black leading-none text-white touch-manipulation',
                  'shadow-[inset_0_2px_0_rgba(255,255,255,0.24),0_4px_14px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.98]',
                  tileClassForWagerValue(value, isFinalWagerRound),
                  !enabled && 'pointer-events-none opacity-40',
                  selected && 'ring-2 ring-[#1de8ff] ring-offset-2 ring-offset-[#060612]',
                )}
              >
                {formatWagerGridLabel(value, isFinalWagerRound)}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        className="mt-5 w-full rounded-xl border-2 border-[#1de8ff] bg-[rgba(5,12,34,0.88)] px-4 py-3.5 text-[clamp(0.72rem,3.1vw,0.88rem)] font-black uppercase tracking-[0.1em] text-[#47eaff] shadow-[0_0_18px_rgba(29,232,255,0.28)] transition-colors touch-manipulation hover:bg-[rgba(8,22,56,0.95)] sm:mt-6 sm:py-4"
      >
        Submit Point Selection
      </button>
    </motion.div>
  );
}

function WagerLockedView({
  wagerAmount,
  isFinalWagerRound,
}: {
  wagerAmount: number;
  isFinalWagerRound: boolean;
}) {
  return (
    <motion.div
      key="wager-locked"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="relative z-10 flex w-full max-w-[min(22rem,92vw)] flex-col items-center px-4 pb-10 pt-10 sm:max-w-md sm:px-5 sm:pt-14"
    >
      <div className="flex h-[clamp(4.5rem,18vw,5.5rem)] w-[clamp(4.5rem,18vw,5.5rem)] items-center justify-center rounded-full border-2 border-[#1de8ff] bg-[rgba(5,14,34,0.75)] shadow-[0_0_22px_rgba(29,232,255,0.4)]">
        <svg
          viewBox="0 0 24 24"
          className="h-[clamp(2rem,8vw,2.5rem)] w-[clamp(2rem,8vw,2.5rem)] text-[#1de8ff]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </div>

      <p className="mt-6 text-center text-[clamp(0.95rem,4.2vw,1.2rem)] font-black uppercase tracking-[0.06em] text-[#47eaff] drop-shadow-[0_0_12px_rgba(71,234,255,0.35)]">
        Points Are Locked In !!
      </p>

      <div className="mt-6 w-full rounded-full bg-linear-to-b from-[#ff2b2b] via-[#c40012] to-[#7a0010] px-4 py-3.5 text-center shadow-[inset_0_2px_0_rgba(255,255,255,0.28),0_8px_22px_rgba(0,0,0,0.45)] sm:py-4">
        <p className="text-[clamp(0.72rem,3.2vw,0.92rem)] font-black uppercase tracking-[0.05em] text-white">
          Your Selected Points :{' '}
          {isFinalWagerRound ? `${wagerAmount}%` : `${wagerAmount} Pts`}
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
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-linear-to-b from-[#1a004d] via-[#120838] to-[#000000]">
      <AnimatePresence mode="wait">
        {wagerSubmitted ? (
          <WagerLockedView wagerAmount={wagerAmount} isFinalWagerRound={isFinalWagerRound} />
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
