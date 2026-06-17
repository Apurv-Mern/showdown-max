'use client';

import { motion } from 'framer-motion';
import { cn, toDisplayUpper } from '@/lib/utils';

export const WAGER_POINT_OPTIONS = [0, 10, 20, 30, 40, 50] as const;
export const FINAL_WAGER_PERCENT_OPTIONS = [0, 20, 40, 60, 80, 100] as const;

type PlayerWagerSelectionScreenLegacyProps = {
  category?: string | null;
  isFinalWagerRound: boolean;
  wagerAmount: number;
  wagerSubmitted: boolean;
  wagerChoiceValues: readonly number[];
  lockedWagerLabel: string;
  onSelectAmount: (amount: number) => void;
  onSubmit: () => void;
  waitingForHost: boolean;
};

/** Previous player wager UI — preserved for reference / rollback. */
export function PlayerWagerSelectionScreenLegacy({
  category,
  isFinalWagerRound,
  wagerAmount,
  wagerSubmitted,
  wagerChoiceValues,
  lockedWagerLabel,
  onSelectAmount,
  onSubmit,
  waitingForHost,
}: PlayerWagerSelectionScreenLegacyProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4 text-center sm:p-6 md:p-8">
      <div className="w-full max-w-sm md:max-w-md">
        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-bold mb-4 uppercase text-glow-cyan"
        >
          PLACE YOUR WAGER
        </motion.h2>
        {category ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#00d9ff]/45 bg-[rgba(0,217,255,0.08)] px-4 py-1.5 shadow-[0_0_14px_rgba(0,217,255,0.18)]"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9de9ff]/80">
              Category
            </span>
            <span className="text-sm font-bold uppercase tracking-[0.14em] text-[#00d9ff]">
              {toDisplayUpper(category)}
            </span>
          </motion.div>
        ) : null}
        {isFinalWagerRound ? (
          <p className="text-foreground/40 text-sm mb-6 uppercase">
            Wager 0%–100% of your current score on the final question.
          </p>
        ) : (
          <div className="mb-6 space-y-2 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-left text-sm uppercase leading-snug text-white/75 sm:text-center">
            <p>
              Choose a fixed wager: 0, 10, 20, 30, 40, or 50 points before the question is revealed.
            </p>
            <p>
              <span className="font-semibold text-neon-green/90">Correct</span> = gain wagered amount.{' '}
              <span className="font-semibold text-red-400/90">Incorrect</span> = lose wagered amount.
            </p>
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="neon-border rounded-xl p-4 mb-4 bg-surface/80 sm:p-6"
        >
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {wagerChoiceValues.map((val) => (
              <button
                key={val}
                type="button"
                disabled={wagerSubmitted}
                onClick={() => onSelectAmount(val)}
                className={cn(
                  'rounded-xl border-2 py-3.5 text-base font-black transition touch-manipulation sm:py-4 sm:text-lg',
                  wagerAmount === val
                    ? 'border-[#00d8ff] bg-[#00d8ff]/20 text-white shadow-[0_0_14px_rgba(0,216,255,0.35)]'
                    : 'border-white/20 bg-black/35 text-white/90 active:brightness-110',
                  wagerSubmitted && 'cursor-not-allowed',
                  wagerSubmitted && wagerAmount !== val && 'opacity-35',
                )}
              >
                {isFinalWagerRound ? `${val}%` : val}
              </button>
            ))}
          </div>
          <p className="text-3xl font-mono font-bold text-neon-cyan text-glow-cyan mt-4 sm:text-4xl">
            {isFinalWagerRound ? `${wagerAmount}%` : `${wagerAmount} pts`}
          </p>
        </motion.div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={wagerSubmitted}
          className={cn(
            'w-full py-4 text-lg font-bold rounded-xl border transition-colors touch-manipulation',
            wagerSubmitted
              ? 'bg-green-500/20 text-green-400 border-green-500/50 cursor-not-allowed'
              : 'bg-neon-cyan/20 text-neon-cyan border-neon-cyan/50 hover:bg-neon-cyan/30',
          )}
        >
          {wagerSubmitted ? '✓ Wager Locked' : 'Lock Wager'}
        </button>
        {wagerSubmitted && (
          <div className="mt-4 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm">
            <p className="font-semibold text-green-300">Wager locked in: {lockedWagerLabel}</p>
            <p className="mt-1 text-white/60">
              {waitingForHost
                ? 'Waiting for host to start the round...'
                : 'Return to the question to submit your answer.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
