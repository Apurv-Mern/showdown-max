'use client';

import { cn } from '@/lib/utils';
import { DEFAULT_KANGAROO_NAMES } from '@/lib/kangarooRaceDefaults';
import { KANGAROO_SELECT_ASSETS } from '@/lib/kangarooSelectAssets';
import { PlayerKangarooChoiceButton } from '@/components/player/PlayerKangarooChoiceButton';

export const KANGAROO_VENUE_FOOTER = 'RACE WILL BE SHOWN ON THE VENUE SCREENS';

const KANGAROO_SLOTS = [1, 2, 3, 4, 5, 6] as const;

type PlayerKangarooSelectScreenProps = {
  kangarooNames: string[];
  selectedChoice: number | null;
  roundOpen: boolean;
  onSelect: (kangarooId: number) => void;
  className?: string;
};

export function PlayerKangarooSelectScreen({
  kangarooNames,
  selectedChoice,
  roundOpen,
  onSelect,
  className,
}: PlayerKangarooSelectScreenProps) {
  const buttonsDisabled = !roundOpen || selectedChoice !== null;

  return (
    <div
      className={cn(
        'player-figma-bg relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-6 pt-[70px]',
        className,
      )}
    >
      <img
        src={KANGAROO_SELECT_ASSETS.bgHalo}
        alt=""
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 h-[min(46vh,437px)] w-[min(99vw,436px)] -translate-x-1/2 object-contain object-bottom opacity-[0.08]"
      />

      <header className="relative shrink-0 text-center">
        <h1 className="text-[30px] font-extrabold uppercase leading-none text-white">
          KANGAROO RACE !!
        </h1>
        <p className="mt-1 text-[20px] font-extrabold uppercase leading-none text-white">
          SELECT YOUR KANGAROO
        </p>
      </header>

      <div className="relative mx-auto mt-4 flex w-full max-w-[295px] flex-col items-center">
        <img
          src={KANGAROO_SELECT_ASSETS.hero}
          alt=""
          className="relative z-[1] h-[min(42vw,220px)] w-[min(72vw,295px)] object-contain"
          draggable={false}
        />
        <img
          src={KANGAROO_SELECT_ASSETS.heroShadow}
          alt=""
          aria-hidden
          className="pointer-events-none relative -mt-6 h-[36px] w-[min(48vw,177px)] max-w-full opacity-90"
          draggable={false}
        />
      </div>

      <div className="relative mx-auto mt-2 grid w-full grid-cols-2 gap-x-3 gap-y-[25px] pt-2">
        {KANGAROO_SLOTS.map((id, index) => (
          <PlayerKangarooChoiceButton
            key={id}
            index={index}
            label={kangarooNames[id - 1] || DEFAULT_KANGAROO_NAMES[id - 1]}
            selected={selectedChoice === id}
            disabled={buttonsDisabled}
            onClick={() => onSelect(id)}
          />
        ))}
      </div>

      <div
        className="relative mx-auto mt-6 flex min-h-[64px] w-full shrink-0 items-center justify-center rounded-[20px] bg-black px-3 py-3 text-center shadow-[0_0_18px_rgba(0,16,255,0.55)]"
        style={{ border: '2px solid #0010FF' }}
      >
        <p className="text-[18px] font-bold leading-[1.15] text-white">
          {selectedChoice
            ? 'PICK LOCKED !!'
            : !roundOpen
              ? 'RACE STARTED — PICKS ARE CLOSED'
              : KANGAROO_VENUE_FOOTER}
        </p>
      </div>
      {selectedChoice ? (
        <p className="relative mt-2 text-center text-sm font-bold text-white/80">{KANGAROO_VENUE_FOOTER}</p>
      ) : !roundOpen ? (
        <p className="relative mt-2 text-center text-sm font-bold text-white/80">
          Watch the race on the venue screen
        </p>
      ) : null}
    </div>
  );
}
