'use client';

import { FIGMA_OPTION_ACCENTS } from '@/lib/designTokens';

const RULES = [
  {
    number: 1,
    text: 'NO CHEATING ALLOWED DURING GAMESHOW',
    ...FIGMA_OPTION_ACCENTS[0],
  },
  {
    number: 2,
    text: 'NOT NECESSARY ANYWAY, PLAYERS ARE SMART ENOUGH',
    ...FIGMA_OPTION_ACCENTS[1],
  },
  {
    number: 3,
    text: 'HOST IS ALWAYS RIGHT, EVEN IF HE/SHE NEVER STARTS ON TIME',
    ...FIGMA_OPTION_ACCENTS[2],
  },
] as const;

export function PlayerCodeOfConductScreen() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto">
      <h1
        className="w-full shrink-0 px-2 pt-1 text-center text-[clamp(36px,10vw,48px)] font-extrabold uppercase leading-[0.95] text-white"
        style={{ textShadow: '0 0 5px #0010FF, 0 0 2px #00D9FF' }}
      >
        CODE OF CONDUCT
      </h1>

      <ol className="mt-6 flex w-full max-w-[400px] flex-col gap-4">
        {RULES.map((rule) => (
          <li
            key={rule.number}
            className="relative flex min-h-[72px] w-full items-center overflow-hidden rounded-full"
            style={{
              background: 'linear-gradient(180deg, #00072F 0%, #00010A 100%)',
              border: `1.5px solid ${rule.accent}`,
              boxShadow: `0 0 12px ${rule.accent}88`,
            }}
          >
            <div
              className="absolute inset-y-0 left-0 w-[52px]"
              style={{
                background: `linear-gradient(180deg, ${rule.from} 0%, ${rule.to} 100%)`,
              }}
            />
            <div
              className="relative z-10 ml-[9px] flex size-[35px] shrink-0 items-center justify-center rounded-full"
              style={{
                background: 'radial-gradient(circle, #1A00FF 30%, #040040 100%)',
                boxShadow: '0 0 8px #00D0FF',
              }}
            >
              <span className="text-[20px] font-extrabold leading-none text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]">
                {rule.number}
              </span>
            </div>
            <p className="relative z-10 ml-3 mr-4 min-w-0 flex-1 whitespace-normal break-words py-3 text-left text-[15px] font-extrabold uppercase leading-snug text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]">
              {rule.text}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-auto flex shrink-0 justify-center pb-8 pt-4">
        <img
          src="/logo.png"
          alt="Max Showdown Trivia"
          className="h-auto w-[220px] max-w-[70%] object-contain object-bottom"
          draggable={false}
        />
      </div>
    </div>
  );
}
