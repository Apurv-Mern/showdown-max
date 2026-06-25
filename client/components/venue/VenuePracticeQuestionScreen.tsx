'use client';

import { cn, toDisplayUpper } from '@/lib/utils';
import { QuestionTimerArch } from '@/components/shared/QuestionTimerArch';

const PRACTICE_QUESTION = 'WHICH PERIOD IS KNOWN AS THE AGE OF DINOSAURS?';

const PRACTICE_OPTIONS = [
  { letter: 'A', text: 'PALEOZOIC', tone: 'bg-linear-to-b from-[#0190F5] to-[#015FB4]' },
  { letter: 'B', text: 'ICE AGE', tone: 'bg-linear-to-b from-[#FF6F00] to-[#994200]' },
  { letter: 'C', text: 'JURASSIC', tone: 'bg-linear-to-b from-[#2DA600] to-[#227E00]' },
  { letter: 'D', text: 'CAMBRIAN', tone: 'bg-linear-to-b from-[#F29B00] to-[#B97700]' },
  { letter: 'E', text: 'DEVONIAN', tone: 'bg-linear-to-b from-[#460073] to-[#5C0098]' },
  { letter: 'F', text: 'CARBONIFEROUS', tone: 'bg-linear-to-b from-[#990003] to-[#D20023]' },
] as const;

export function VenuePracticeQuestionScreen() {
  return (
    <div className="flex h-full min-h-0 w-full animate-fadeIn flex-col px-4 py-3 sm:px-8 sm:py-4 md:px-10">
      <header className="shrink-0 flex justify-center">
        <img
          src="/pratice%20question.png"
          alt="Practice Question"
          className="w-full max-w-[min(1040px,96vw)] object-contain drop-shadow-[0_0_22px_rgba(0,217,255,0.35)]"
          draggable={false}
        />
      </header>

      <div className="relative mx-auto my-3 flex h-24 w-full max-w-md shrink-0 justify-center sm:my-4 sm:h-28 md:h-32">
        <QuestionTimerArch remainingSeconds={30} totalSeconds={30} size="venue" />
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[min(1040px,96vw)] flex-1 flex-col rounded-2xl border border-[#4a6fa5]/70 bg-[linear-gradient(180deg,rgba(18,28,68,0.95)_0%,rgba(6,8,28,0.98)_100%)] p-4 shadow-[0_0_28px_rgba(0,0,0,0.45)] sm:p-5 md:p-6">
        <h2 className="mb-4 text-center text-[clamp(1rem,2.2vw,1.65rem)] font-black uppercase leading-snug tracking-wide text-white sm:mb-5">
          {toDisplayUpper(PRACTICE_QUESTION)}
        </h2>
        <div className="grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
          {PRACTICE_OPTIONS.map((opt) => (
            <div
              key={opt.letter}
              className={cn(
                'flex min-h-11 items-center rounded-lg border border-white/20 px-4 py-2.5 shadow-[0_4px_14px_rgba(0,0,0,0.4)] sm:min-h-12 sm:px-5',
                opt.tone,
              )}
            >
              <span className="text-[clamp(0.78rem,1.5vw,1.05rem)] font-black uppercase leading-tight text-white drop-shadow-md">
                {opt.letter}. {opt.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
