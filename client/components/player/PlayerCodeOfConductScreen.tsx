'use client';

import { cn } from '@/lib/utils';
import { PlayerPreGamePanel, PlayerPreGameTitle } from './PlayerPreGamePanel';

const RULES = [
  { number: 1, text: 'NO CHEATING ALLOWED', bar: 'bg-linear-to-r from-[#ff2d2d] via-[#e81919] to-[#c40f0f]' },
  { number: 2, text: 'NOT NECESSARY ANYWAYS', bar: 'bg-linear-to-r from-[#ffb020] via-[#f59e0b] to-[#d97706]' },
  { number: 3, text: 'HOST IS ALWAYS RIGHT', bar: 'bg-linear-to-r from-[#22c55e] via-[#16a34a] to-[#15803d]' },
] as const;

function ConductRuleRow({ number, text, bar }: { number: number; text: string; bar: string }) {
  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 rounded-full border border-white/20 px-3 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.35)] sm:gap-3.5 sm:px-4 sm:py-3',
        bar,
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-base font-black text-[#1a1030] shadow-[0_2px_6px_rgba(0,0,0,0.35)] sm:h-10 sm:w-10">
        {number}
      </div>
      <p className="min-w-0 flex-1 text-left text-[clamp(0.72rem,3.4vw,1rem)] font-black uppercase leading-tight tracking-wide text-white">
        {text}
      </p>
    </div>
  );
}

export function PlayerCodeOfConductScreen() {
  return (
    <PlayerPreGamePanel className="animate-fadeIn">
      <div className="flex min-h-0 flex-1 flex-col py-2">
        <div className="shrink-0 mb-8">
          <PlayerPreGameTitle className="text-[clamp(3.35rem,15vw,5.25rem)] leading-[0.86]">
            Code of
            <br />
            Conduct
          </PlayerPreGameTitle>
        </div>
        <div className="flex flex-col gap-3 sm:gap-3.5">
          {RULES.map((rule) => (
            <ConductRuleRow key={rule.number} {...rule} />
          ))}
        </div>
        <div className="mt-auto flex shrink-0 justify-center pb-1 pt-6">
          <img
            src="/logo.png"
            alt="Max Showdown Trivia"
            className="h-auto w-[min(300px,78vw)] max-w-full object-contain drop-shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
            draggable={false}
          />
        </div>
      </div>
    </PlayerPreGamePanel>
  );
}
