'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn, toDisplayUpper } from '@/lib/utils';
import { LoadingDots } from '@/app/play/LoadingDots';

export const WAGER_POINT_OPTIONS = [0, 10, 20, 30, 40, 50] as const;
export const FINAL_WAGER_PERCENT_OPTIONS = [0, 20, 40, 60, 80, 100] as const;

const WAGER_TILE_CLASS: Record<number, string> = {
  0: 'bg-linear-to-b from-[#0190F5] to-[#015FB4]',
  10: 'bg-linear-to-b from-[#FF6F00] to-[#994200]',
  20: 'bg-linear-to-b from-[#2DA600] to-[#227E00]',
  30: 'bg-linear-to-b from-[#F29B00] to-[#B97700]',
  40: 'bg-linear-to-b from-[#460073] to-[#5C0098]',
  50: 'bg-linear-to-b from-[#990003] to-[#D20023]',
};

function tileClassForValue(value: number, isFinalWager: boolean): string {
  if (!isFinalWager) {
    return WAGER_TILE_CLASS[value] ?? 'bg-linear-to-b from-[#1565c0] to-[#0d47a1]';
  }
  const standardSteps = [0, 10, 20, 30, 40, 50];
  const idx = FINAL_WAGER_PERCENT_OPTIONS.indexOf(
    value as (typeof FINAL_WAGER_PERCENT_OPTIONS)[number],
  );
  const standardVal = standardSteps[Math.max(0, idx)] ?? 0;
  return WAGER_TILE_CLASS[standardVal] ?? 'bg-linear-to-b from-[#1565c0] to-[#0d47a1]';
}

function formatOptionLabel(value: number, isFinalWager: boolean): string {
  return isFinalWager ? `${value}%` : `${value}%`;
}

function formatCircleValue(value: number, isFinalWager: boolean): string {
  return isFinalWager ? String(value) : String(value);
}

function formatLockedLabel(value: number, isFinalWager: boolean): string {
  return isFinalWager ? `${value}%` : `${value} Pts`;
}

function WagerBackdrop() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        aria-hidden
        style={{
          backgroundSize: '120px 120px',
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 h-36 w-[min(92vw,320px)] -translate-x-1/2 opacity-45"
        aria-hidden
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(180,190,210,0.55) 1px, transparent 1px)',
          backgroundSize: '10px 10px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 100%, black 20%, transparent 72%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 70% at 50% 100%, black 20%, transparent 72%)',
        }}
      />
    </>
  );
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
  return (
    <motion.div
      key="wager-select"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="relative z-10 flex w-full max-w-[min(22rem,92vw)] flex-col items-center px-4 pb-8 pt-6 sm:max-w-md sm:px-5 sm:pb-10 sm:pt-8"
    >
      <h1 className="text-center text-[clamp(1.35rem,5.5vw,1.85rem)] font-black uppercase leading-tight tracking-[0.04em] text-[#47eaff] drop-shadow-[0_0_16px_rgba(71,234,255,0.45)]">
        Place Your Bets
      </h1>
      <p className="mt-3 text-center text-[clamp(0.62rem,2.8vw,0.78rem)] font-bold uppercase leading-snug tracking-[0.08em] text-white/90">
        {isFinalWagerRound
          ? 'What percentage of your score do you want to risk ?'
          : 'How many points do you want to risk ?'}
      </p>
      {category ? (
        <p className="mt-4 text-center text-[clamp(1.05rem,4.5vw,1.45rem)] font-black uppercase tracking-[0.06em] text-white">
          {toDisplayUpper(category)}
        </p>
      ) : null}

      <div className="relative mt-5 flex h-[clamp(7.5rem,28vw,9.5rem)] w-[clamp(7.5rem,28vw,9.5rem)] items-center justify-center sm:mt-6">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_38%,rgba(88,28,160,0.55)_0%,rgba(8,4,24,0.95)_68%)] shadow-[inset_0_0_28px_rgba(0,0,0,0.65)]" />
        <div className="absolute inset-0 rounded-full border-[5px] border-[#1de8ff] shadow-[0_0_22px_rgba(29,232,255,0.55),0_0_44px_rgba(29,232,255,0.22)]" />
        <span className="relative z-10 text-[clamp(2.75rem,11vw,3.75rem)] font-black leading-none text-white">
          {formatCircleValue(wagerAmount, isFinalWagerRound)}
        </span>
      </div>

      <div className="mt-5 flex w-full flex-col gap-2.5 sm:mt-6 sm:gap-3">
        {wagerChoiceValues.map((value) => {
          const selected = wagerAmount === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelectAmount(value)}
              className={cn(
                'w-full rounded-xl py-3.5 text-[clamp(1.15rem,4.8vw,1.55rem)] font-black leading-none text-white touch-manipulation',
                'shadow-[inset_0_2px_0_rgba(255,255,255,0.22),0_4px_14px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.98]',
                tileClassForValue(value, isFinalWagerRound),
                selected && 'ring-2 ring-[#1de8ff] ring-offset-2 ring-offset-[#050017]',
              )}
            >
              {formatOptionLabel(value, isFinalWagerRound)}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onSubmit}
        className="mt-6 w-full rounded-xl border-2 border-[#1de8ff] bg-[rgba(5,12,34,0.88)] px-4 py-3.5 text-[clamp(0.72rem,3.1vw,0.88rem)] font-black uppercase tracking-[0.1em] text-[#47eaff] shadow-[0_0_18px_rgba(29,232,255,0.28)] transition-colors touch-manipulation hover:bg-[rgba(8,22,56,0.95)] sm:mt-7 sm:py-4"
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
          Your Selected Points : {formatLockedLabel(wagerAmount, isFinalWagerRound)}
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
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden">
      <WagerBackdrop />
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
