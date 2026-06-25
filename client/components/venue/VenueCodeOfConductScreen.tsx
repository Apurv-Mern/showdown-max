'use client';

import { cn } from '@/lib/utils';

const RULES = [
  { number: 1, text: 'NO CHEATING ALLOWED', bar: 'from-[#ff2d2d] via-[#e81919] to-[#c40f0f]', shadow: 'shadow-[0_0_18px_rgba(255,45,45,0.45)]' },
  { number: 2, text: 'NOT NECESSARY ANYWAYS', bar: 'from-[#ffb020] via-[#f59e0b] to-[#d97706]', shadow: 'shadow-[0_0_18px_rgba(255,176,32,0.4)]' },
  { number: 3, text: 'HOST IS ALWAYS RIGHT', bar: 'from-[#22c55e] via-[#16a34a] to-[#15803d]', shadow: 'shadow-[0_0_18px_rgba(34,197,94,0.4)]' },
] as const;

function ConductRuleBar({ number, text, bar, shadow }: { number: number; text: string; bar: string; shadow: string }) {
  return (
    <div
      className={cn(
        'flex w-full max-w-[min(920px,94vw)] items-center gap-3 rounded-full border border-white/25 bg-linear-to-r px-4 py-3 sm:gap-4 sm:px-5 sm:py-3.5',
        bar,
        shadow,
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#1e3a8a] bg-[#1d4ed8] text-lg font-black text-white sm:h-11 sm:w-11 sm:text-xl">
        {number}
      </div>
      <p className="min-w-0 flex-1 text-left text-[clamp(1rem,2.2vw,1.65rem)] font-black uppercase leading-tight tracking-wide text-white">
        {text}
      </p>
    </div>
  );
}

export function VenueCodeOfConductScreen() {
  return (
    <div className="flex h-full min-h-0 w-full animate-fadeIn flex-col px-4 py-4 sm:px-8 sm:py-6 md:px-12">
      <header className="shrink-0 flex justify-center">
        <img
          src="/coc.png"
          alt="Code of Conduct"
          className="w-full max-w-[min(920px,94vw)] object-contain drop-shadow-[0_0_22px_rgba(0,217,255,0.35)]"
          draggable={false}
        />
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-6 sm:gap-5 md:py-8">
        {RULES.map((rule) => (
          <ConductRuleBar key={rule.number} {...rule} />
        ))}
      </div>
      <footer className="flex shrink-0 justify-center pb-2">
        <img
          src="/logo.png"
          alt="Max Showdown Trivia"
          className="h-auto w-[min(380px,48vw)] object-contain drop-shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
          draggable={false}
        />
      </footer>
    </div>
  );
}
