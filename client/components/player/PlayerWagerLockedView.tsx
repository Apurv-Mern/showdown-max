'use client';

import { motion } from 'framer-motion';
import { LoadingDots } from '@/app/play/LoadingDots';
import { PLAYER_WAGER_LOCKED_ASSETS } from '@/lib/playerWagerChoiceAssets';
import { formatWagerButtonLabel } from '@/lib/wagerGrid';

function formatLockedSummary(value: number, isFinalWagerRound: boolean): string {
  return `${formatWagerButtonLabel(value, isFinalWagerRound)} POINTS`;
}

/** Figma "Wager Points Selected" (node 2114:6668). */
export function PlayerWagerLockedView({
  wagerAmount,
  isFinalWagerRound,
}: {
  wagerAmount: number;
  isFinalWagerRound: boolean;
}) {
  const summary = formatLockedSummary(wagerAmount, isFinalWagerRound);

  return (
    <motion.div
      key="wager-locked"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center justify-center px-5 pb-10 pt-10 sm:px-6"
    >
      <img
        src={PLAYER_WAGER_LOCKED_ASSETS.halo}
        alt=""
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 h-[min(46vh,437px)] w-[min(99vw,436px)] -translate-x-1/2 object-contain object-bottom opacity-[0.08]"
      />

      <div className="relative flex w-full max-w-[400px] flex-col items-center">
        <div className="relative size-20">
          <img
            src={PLAYER_WAGER_LOCKED_ASSETS.ring}
            alt=""
            aria-hidden
            className="absolute inset-[-1.25%] size-full max-w-none"
          />
          <img
            src={PLAYER_WAGER_LOCKED_ASSETS.lockIcon}
            alt=""
            aria-hidden
            className="absolute left-1/2 top-1/2 size-[52px] -translate-x-1/2 -translate-y-1/2"
          />
        </div>

        <p className="mt-[15px] text-center text-[25px] font-bold uppercase leading-[30px] text-white">
          POINTS ARE LOCKED IN !!
        </p>

        <div className="relative mt-[23px] h-[50px] w-full max-w-[400px]">
          <span className="pointer-events-none absolute inset-[-21%_-2.63%]">
            <img
              src={PLAYER_WAGER_LOCKED_ASSETS.summaryBar}
              alt=""
              className="block size-full max-w-none"
              aria-hidden
            />
          </span>
          <p className="relative flex h-full items-center justify-center px-2 text-center text-[20px] font-extrabold uppercase leading-none text-white">
            YOUR SELECTED : {summary}
          </p>
        </div>
      </div>

      <LoadingDots variant="sequential" className="mt-10" gapClass="gap-2.5" />
    </motion.div>
  );
}
