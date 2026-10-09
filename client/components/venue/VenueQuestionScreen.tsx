'use client';

import type { RefObject } from 'react';
import { cn, toDisplayUpper } from '@/lib/utils';
import { FIGMA_OPTION_LETTERS } from '@/lib/designTokens';
import { VenueAutoFitText } from '@/components/venue/VenueAutoFitText';
import { VenueChoiceBar } from '@/components/venue/VenueChoiceBar';
import { VenueLiveResponseHud, type VenueLiveResponseStats } from '@/components/venue/VenueLiveResponseHud';
import { VenueStatBadge } from '@/components/venue/VenueStatBadge';
import { VenueTimerRing } from '@/components/venue/VenueTimerRing';

type QuestionOption = { text: string };

type VenueQuestionScreenProps = {
  questionText: string;
  questionIndex: number;
  totalQuestions: number;
  options: QuestionOption[];
  timerRemaining: number;
  timerDuration: number;
  stats: VenueLiveResponseStats;
  roundType?: string;
  teamCount: number;
  pointsLabel: string;
  media?: { type?: string; url?: string } | null;
  videoRef?: RefObject<HTMLVideoElement | null>;
  revealed?: boolean;
  winnerIndexes?: number[];
  correctOrderLabel?: string | null;
};

export function VenueQuestionScreen({
  questionText,
  questionIndex,
  options,
  timerRemaining,
  timerDuration,
  stats,
  roundType,
  teamCount,
  pointsLabel,
  media,
  videoRef,
  revealed = false,
  winnerIndexes = [],
  correctOrderLabel,
}: VenueQuestionScreenProps) {
  const mediaType = (media?.type || '').toLowerCase();
  const hasImage = Boolean(media?.url && mediaType === 'image');
  const hasVideo = Boolean(media?.url && mediaType === 'mp4');
  const winners = new Set(winnerIndexes);
  const scrollWholeScreen = hasImage;

  return (
    <div
      className={cn(
        'relative flex w-full flex-col px-[60px] pt-[24px] animate-fadeIn',
        scrollWholeScreen
          ? 'h-full min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] pb-10'
          : 'h-full',
      )}
    >
      <div className="flex h-[152px] items-center justify-between">
        <VenueTimerRing remainingSeconds={timerRemaining} totalSeconds={timerDuration} />
        <VenueLiveResponseHud stats={stats} roundType={roundType} />
        <div className="flex items-center gap-8">
          <VenueStatBadge kind="teams" value={teamCount} />
          <VenueStatBadge kind="points" value={pointsLabel} />
        </div>
      </div>

      <div
        className={cn(
          'relative mt-[33px] flex w-full rounded-[30px] px-[48px]',
          hasImage
            ? 'h-[398px] items-stretch py-8'
            : 'h-[398px] items-center justify-center overflow-hidden',
        )}
        style={{
          background: 'linear-gradient(180deg, #00072F 0%, #00010A 100%)',
          border: '3px solid #00D9FF',
          boxShadow: '0 0 24px rgba(0, 217, 255, 0.45)',
        }}
      >
        {hasImage ? (
          <div className="flex h-full min-h-0 w-full items-stretch gap-10">
            <div className="flex h-full w-[min(42%,520px)] shrink-0 items-center justify-center overflow-hidden rounded-[16px] border-2 border-[#00D9FF]/55 bg-black/35 p-2">
              <img
                src={media?.url}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center py-2">
              <VenueAutoFitText
                className="w-full text-left font-extrabold uppercase leading-tight text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]"
                minFontSize={32}
                maxFontSize={56}
                step={2}
              >
                {`Q${questionIndex + 1}. ${toDisplayUpper(questionText)}`}
              </VenueAutoFitText>
            </div>
          </div>
        ) : hasVideo ? (
          <video
            ref={videoRef}
            key={media?.url}
            src={media?.url}
            className="h-full w-full object-contain"
            playsInline
            preload="auto"
          />
        ) : (
          <VenueAutoFitText
            className="flex h-full w-full items-center justify-center text-center font-extrabold uppercase leading-tight text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]"
            minFontSize={36}
            maxFontSize={60}
            step={2}
          >
            {`Q${questionIndex + 1}. ${toDisplayUpper(questionText)}`}
          </VenueAutoFitText>
        )}
      </div>

      {hasVideo ? (
        <p className="mt-3 text-center text-[36px] font-extrabold uppercase text-white">
          Q{questionIndex + 1}. {toDisplayUpper(questionText)}
        </p>
      ) : null}

      {correctOrderLabel ? (
        <p className="mt-2 text-center text-[28px] font-extrabold uppercase text-[#38FF00]">
          {correctOrderLabel}
        </p>
      ) : null}

      <div className={cn('mt-[28px] grid grid-cols-2 gap-x-[40px] gap-y-[30px]', hasVideo && 'mt-4')}>
        {options.map((opt, i) => (
          <VenueChoiceBar
            key={i}
            index={i}
            letter={FIGMA_OPTION_LETTERS[i] ?? String.fromCharCode(65 + i)}
            label={toDisplayUpper(opt.text)}
            revealed={revealed}
            isWinner={winners.has(i)}
          />
        ))}
      </div>
    </div>
  );
}
