'use client';

import { VenueLogo } from '@/components/venue/VenueLogo';

const RULES = [
  {
    number: 1,
    text: 'NO CHEATING ALLOWED DURNING GAMESHOW',
    pillSrc: '/venue/code-of-conduct/rule-1.svg',
    badgeSrc: '/venue/code-of-conduct/badge-1.svg',
  },
  {
    number: 2,
    text: 'NOT NECCESSARY ANYWAY, PLAYERS ARE SMART ENOUGH',
    pillSrc: '/venue/code-of-conduct/rule-2.svg',
    badgeSrc: '/venue/code-of-conduct/badge-2.svg',
  },
  {
    number: 3,
    text: 'HOST IS ALWAYS RIGHT, EVEN IF HE/SHE NEVER STARTS ON TIME',
    pillSrc: '/venue/code-of-conduct/rule-3.svg',
    badgeSrc: '/venue/code-of-conduct/badge-3.svg',
  },
] as const;

export function VenueCodeOfConductScreen() {
  return (
    <section
      className="absolute inset-0 z-20 flex flex-col items-center animate-fadeIn"
      aria-labelledby="venue-code-of-conduct-title"
    >
      <div className="relative flex h-full w-full flex-col items-center pb-0">
        <div className="relative mt-[27px] h-[208px] w-[1322px] max-w-[calc(100%-80px)] shrink-0">
          <img
            src="/venue/code-of-conduct/header-outer.svg"
            alt=""
            className="absolute inset-0 h-full w-full"
            draggable={false}
          />
          <img
            src="/venue/code-of-conduct/header-inner.svg"
            alt=""
            className="absolute left-[26px] top-[29px] h-[198px] w-[calc(100%-52px)] max-w-[1270px]"
            draggable={false}
          />
          <h1
            id="venue-code-of-conduct-title"
            className="absolute inset-0 flex items-center justify-center text-center text-[90px] font-extrabold uppercase leading-[80px] text-white [text-shadow:0_10px_10px_black]"
          >
            CODE&nbsp;&nbsp;OF&nbsp;&nbsp;CONDUCT
          </h1>
        </div>

        <ol className="mt-[69px] flex w-[1072px] max-w-[calc(100%-80px)] flex-col gap-[50px]">
          {RULES.map((rule) => (
            <li key={rule.number} className="relative h-[110px] w-full">
              <img
                src={rule.pillSrc}
                alt=""
                className="pointer-events-none absolute -inset-x-[15px] -inset-y-[15px] h-[calc(100%+30px)] w-[calc(100%+30px)] max-w-none"
                draggable={false}
              />
              <div className="relative flex h-full items-center pl-[18px]">
                <div className="relative size-[77px] shrink-0">
                  <img src={rule.badgeSrc} alt="" className="size-full" draggable={false} />
                  <span className="absolute inset-0 flex items-center justify-center text-[40px] font-extrabold text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]">
                    {rule.number}
                  </span>
                </div>
                <p className="min-w-0 flex-1 pl-[52px] pr-6 text-[30px] font-extrabold uppercase leading-tight text-black">
                  {rule.text}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <VenueLogo width={607} className="mt-auto mb-0 h-[305px] w-[607px] max-w-[90%] object-contain object-bottom" />
      </div>
    </section>
  );
}
