'use client';

import { cn, toDisplayUpper } from '@/lib/utils';
import { PlayerPreGamePanel, PlayerPreGameTitle } from './PlayerPreGamePanel';

const PRACTICE_QUESTION = 'WHICH PERIOD IS KNOWN AS THE AGE OF DINOSAURS?';

const INFO_ITEMS = [
  {
    label: 'GET YOURSELF WARMED UP',
    icon: (
      <path
        fill="currentColor"
        d="M12 2c1.2 3.1 3.4 4.8 3.4 8.2 0 2.2-1.2 4.1-3 5.1.8 2.4 2.2 3.9 3.6 5.7-2.5-.6-4.4-2.2-5.6-4.3-1.2 2.1-3.1 3.7-5.6 4.3 1.4-1.8 2.8-3.3 3.6-5.7-1.8-1-3-2.9-3-5.1C8.6 6.8 10.8 5.1 12 2zm0 4.2c-.5 1.2-1.1 1.9-1.1 3 0 1.2.6 2.2 1.5 2.8.3.2.5.5.6.9.2.9.6 1.7 1.1 2.4-.9-.4-1.6-1.1-2-2-.4.9-1.1 1.6-2 2 .5-.7.9-1.5 1.1-2.4.1-.4.3-.7.6-.9.9-.6 1.5-1.6 1.5-2.8 0-1.1-.6-1.8-1.1-3z"
      />
    ),
  },
  {
    label: 'NO POINTS LOST OR SCORED EITHERWAY',
    icon: (
      <path
        fill="currentColor"
        d="M12 2 4 5v6c0 5 3.4 9.3 8 10 4.6-.7 8-5 8-10V5l-8-3zm0 2.2 6 2.25V11c0 3.8-2.5 7.2-6 7.9-3.5-.7-6-4.1-6-7.9V6.45l6-2.25z"
      />
    ),
  },
  {
    label: 'USED TO THE FORMAT',
    icon: (
      <path
        fill="currentColor"
        d="m12 2 2.4 4.9 5.4.8-3.9 3.8.9 5.3L12 14.8 7.2 16.8l.9-5.3L4.2 7.7l5.4-.8L12 2z"
      />
    ),
  },
] as const;

const PRACTICE_OPTIONS = [
  { letter: 'A', text: 'PALEOZOIC', tone: 'bg-linear-to-b from-[#0190F5] to-[#015FB4]' },
  { letter: 'B', text: 'ICE AGE', tone: 'bg-linear-to-b from-[#FF6F00] to-[#994200]' },
  { letter: 'C', text: 'JURASSIC', tone: 'bg-linear-to-b from-[#2DA600] to-[#227E00]' },
  { letter: 'D', text: 'CAMBRIAN', tone: 'bg-linear-to-b from-[#F29B00] to-[#B97700]' },
  { letter: 'E', text: 'DEVONIAN', tone: 'bg-linear-to-b from-[#460073] to-[#5C0098]' },
  { letter: 'F', text: 'CARBONIFEROUS', tone: 'bg-linear-to-b from-[#990003] to-[#D20023]' },
] as const;

function PracticeInfoPanel() {
  return (
    <div className="rounded-xl border border-[#c084fc]/55 bg-[#1a0a38]/75 px-3 py-3 shadow-[inset_0_0_24px_rgba(124,58,237,0.12)] sm:px-4 sm:py-3.5">
      <ul className="flex flex-col gap-2.5 sm:gap-3">
        {INFO_ITEMS.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 text-left sm:gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0ea5e9]/20 text-[#38bdf8] sm:h-8 sm:w-8">
              <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden>
                {item.icon}
              </svg>
            </span>
            <span className="text-[clamp(0.62rem,2.9vw,0.82rem)] font-bold uppercase leading-tight tracking-wide text-white/95">
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlayerPracticeQuestionScreen() {
  return (
    <PlayerPreGamePanel className="animate-fadeIn">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 mb-8">
          <PlayerPreGameTitle className="text-[clamp(3.35rem,15vw,5.25rem)] leading-[0.86]">
            Practice
            <br />
            Question
          </PlayerPreGameTitle>
        </div>
        <PracticeInfoPanel />
        <div className="mt-4 rounded-xl border-2 border-[#00d9ff]/70 bg-black/90 px-3 py-4 text-center shadow-[0_0_22px_rgba(0,217,255,0.18)] sm:mt-5 sm:px-4 sm:py-5">
          <p className="text-[clamp(0.78rem,3.5vw,1.05rem)] font-black uppercase leading-snug tracking-wide text-white">
            {toDisplayUpper(PRACTICE_QUESTION)}
          </p>
        </div>
        <div className="mt-4 flex flex-1 flex-col gap-2.5 pb-1 sm:mt-5 sm:gap-3">
          {PRACTICE_OPTIONS.map((opt) => (
            <div
              key={opt.letter}
              className={cn(
                'flex min-h-11 w-full items-center rounded-xl border border-white/15 px-4 py-2.5 text-left shadow-[0_4px_14px_rgba(0,0,0,0.35)] sm:min-h-12 sm:px-5',
                opt.tone,
              )}
            >
              <span className="text-[clamp(0.78rem,3.4vw,1rem)] font-black uppercase leading-tight text-white drop-shadow-md">
                {opt.letter}. {opt.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </PlayerPreGamePanel>
  );
}
