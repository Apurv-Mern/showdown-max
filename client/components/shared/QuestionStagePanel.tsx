'use client';

import type { ReactNode } from 'react';
import { cn, toDisplayUpper } from '@/lib/utils';
import { VenueTimerRing } from '@/components/venue/VenueTimerRing';

type QuestionStagePanelProps = {
  timerDisplay: string | number;
  questionIndex: number;
  totalQuestions: number;
  questionText: string;
  teamName?: string;
  score?: string | number;
  pointsDisplay?: string | number;
  timerDuration?: number;
  className?: string;
  /** When set, image fills the main neon box; question copy moves to a box underneath. */
  questionMedia?: ReactNode;
};

/**
 * Player question HUD from Figma 776:19590 — timer ring, team, score, neon question box.
 */
export function QuestionStagePanel({
  timerDisplay,
  questionIndex,
  totalQuestions,
  questionText,
  teamName,
  score,
  pointsDisplay,
  timerDuration = 30,
  className,
  questionMedia,
}: QuestionStagePanelProps) {
  const scoreValue = score ?? pointsDisplay ?? '0';
  const remainingSeconds = Number(timerDisplay);
  const remaining = Number.isFinite(remainingSeconds) ? remainingSeconds : 0;

  return (
    <div className={cn('flex w-full flex-col gap-5', className)}>
      <div
        className="relative flex h-[100px] w-full items-center justify-between gap-3 rounded-[8px] px-5 py-2.5"
        style={{
          background: 'linear-gradient(103deg, #00072F 0%, #00010A 100%)',
          border: '1px solid #0010FF',
        }}
      >
        <VenueTimerRing remainingSeconds={remaining} totalSeconds={timerDuration} size={80} />

        <div className="min-w-0 flex-1 text-center">
          <p className="text-[16px] font-bold uppercase leading-none text-[#00D9FF]">TEAM</p>
          <p className="mt-1 truncate text-[18px] font-bold uppercase leading-tight text-white">
            {toDisplayUpper(teamName) || '—'}
          </p>
        </div>

        <div
          className="flex h-[60px] w-20 shrink-0 flex-col items-center justify-center rounded-[6px]"
          style={{
            background: '#00010A',
            border: '1px solid #0010FF',
          }}
        >
          <p className="text-[14px] font-bold uppercase leading-none text-[#00D9FF]">SCORE</p>
          <p className="mt-1 text-[20px] font-bold uppercase leading-none text-white">{scoreValue}</p>
        </div>
      </div>

      {questionMedia ? (
        <>
          <div
            className="relative flex w-full min-h-[200px] max-h-[min(46vh,340px)] flex-col rounded-[10px] px-3 py-4"
            style={{
              background: '#00010A',
              border: '1px solid #FFFFFF',
              boxShadow: '0 0 15px #0010FF, inset 0 0 15px #0010FF',
            }}
          >
            <p className="shrink-0 text-center text-[16px] font-extrabold uppercase text-white">
              Q. {questionIndex + 1}/{totalQuestions}
            </p>
            <div className="mt-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              {questionMedia}
            </div>
          </div>
          <div
            className="relative flex w-full items-center justify-center rounded-[10px] px-4 py-5"
            style={{
              background: '#00010A',
              border: '1px solid #FFFFFF',
              boxShadow: '0 0 12px #0010FF, inset 0 0 12px #0010FF',
            }}
          >
            <h2 className="text-center text-[18px] font-extrabold uppercase leading-snug text-white sm:text-[20px]">
              {toDisplayUpper(questionText)}
            </h2>
          </div>
        </>
      ) : (
        <div
          className="relative flex min-h-[220px] w-full items-center justify-center rounded-[10px] px-4 py-6"
          style={{
            background: '#00010A',
            border: '1px solid #FFFFFF',
            boxShadow: '0 0 15px #0010FF, inset 0 0 15px #0010FF',
          }}
        >
          <h2 className="text-center text-[22px] font-extrabold uppercase leading-snug text-white">
            Q. {questionIndex + 1}/{totalQuestions}
            <br />
            {toDisplayUpper(questionText)}
          </h2>
        </div>
      )}
    </div>
  );
}
