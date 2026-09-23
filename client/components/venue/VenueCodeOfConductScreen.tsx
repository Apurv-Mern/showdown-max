'use client';

import { FIGMA_OPTION_ACCENTS } from '@/lib/designTokens';
import { VenueLogo } from '@/components/venue/VenueLogo';

const RULES = [
  {
    number: 1,
    text: 'NO CHEATING ALLOWED DURNING GAMESHOW',
    ...FIGMA_OPTION_ACCENTS[0],
  },
  {
    number: 2,
    text: 'NOT NECCESSARY ANYWAY, PLAYERS ARE SMART ENOUGH',
    ...FIGMA_OPTION_ACCENTS[1],
  },
  {
    number: 3,
    text: 'HOST IS ALWAYS RIGHT, EVEN IF HE/SHE NEVER STARTS ON TIME',
    ...FIGMA_OPTION_ACCENTS[2],
  },
] as const;

export function VenueCodeOfConductScreen() {
  return (
    <section
      className="absolute inset-0 z-20 flex flex-col items-center animate-fadeIn"
      aria-labelledby="venue-code-of-conduct-title"
    >
      <div
        className="relative mt-[27px] flex h-[208px] w-[1322px] items-center justify-center"
        style={{
          clipPath: 'polygon(7% 0%, 93% 0%, 100% 50%, 93% 100%, 7% 100%, 0% 50%)',
          background: 'linear-gradient(180deg, #0010FF 0%, #00072F 100%)',
          boxShadow: '0 0 28px rgba(0, 16, 255, 0.55)',
        }}
      >
        <h1
          id="venue-code-of-conduct-title"
          className="text-center text-[90px] font-extrabold uppercase leading-[80px] text-white [text-shadow:0_10px_10px_black]"
        >
          CODE OF CONDUCT
        </h1>
      </div>

      <ol className="mt-[69px] flex w-[1072px] flex-col gap-[50px]">
        {RULES.map((rule) => (
          <li
            key={rule.number}
            className="relative flex h-[110px] w-full items-center overflow-hidden rounded-full"
            style={{
              background: 'linear-gradient(180deg, #00072F 0%, #00010A 100%)',
              border: `2px solid ${rule.accent}`,
              boxShadow: `0 0 14px ${rule.accent}`,
            }}
          >
            <span
              className="flex h-full w-[112px] shrink-0 items-center justify-center"
              style={{ background: `linear-gradient(180deg, ${rule.from} 0%, ${rule.to} 100%)` }}
            >
              <span
                className="flex size-[77px] items-center justify-center rounded-full"
                style={{
                  background: 'radial-gradient(circle at 50% 50%, #001040 0%, #00010A 90%)',
                  boxShadow: `0 0 10px ${rule.accent}`,
                }}
              >
                <span className="text-[40px] font-extrabold text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]">
                  {rule.number}
                </span>
              </span>
            </span>
            <p className="px-8 text-[30px] font-extrabold uppercase leading-tight text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]">
              {rule.text}
            </p>
          </li>
        ))}
      </ol>

      <VenueLogo width={607} className="mt-auto mb-0" />
    </section>
  );
}
