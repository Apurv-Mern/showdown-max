'use client';

import type { CSSProperties, RefObject } from 'react';
import { toDisplayUpper } from '@/lib/utils';
import { FIGMA_OPTION_LETTERS } from '@/lib/designTokens';
import { VenueAutoFitText } from '@/components/venue/VenueAutoFitText';
import { VenueChoiceBar } from '@/components/venue/VenueChoiceBar';
import {
  VenueLiveResponseHud,
  type VenueLiveResponseStats,
} from '@/components/venue/VenueLiveResponseHud';
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

const QUESTION_FRAME_STYLE: CSSProperties = {
  background: 'linear-gradient(180deg, #00072F 0%, #00010A 100%)',
  border: '3px solid #00D9FF',
  boxShadow: '0 0 24px rgba(0, 217, 255, 0.45)',
};

/** Figma node 88:729 — image question: question bar, image left, options stacked right. */
const IMAGE_QUESTION_BAR_STYLE: CSSProperties = {
  ...QUESTION_FRAME_STYLE,
  borderWidth: 3,
  minHeight: 180,
  height: 180,
};

const IMAGE_MEDIA_FRAME_STYLE: CSSProperties = {
  border: '6px solid #00D9FF',
  boxShadow: '0 4px 20px 0 #0085FF',
  borderRadius: 20,
};

/** Fills logical 1920×1080 stage (scaled by VenueStage for 1080p–4K+ / large venue TVs). */
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

  const questionLine = (
    <p className="venue-question-text line-clamp-3 shrink-0 text-center text-[clamp(1.75rem,4.2cqh,2.875rem)] font-normal leading-snug text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]">
      Q{questionIndex + 1}. {toDisplayUpper(questionText)}
    </p>
  );

  const renderOptions = (layout: 'grid' | 'stack') => (
    <div
      className={
        layout === 'stack'
          ? 'flex min-h-0 w-full flex-col gap-[40px]'
          : 'grid w-full shrink-0 grid-cols-2 gap-x-[clamp(1rem,3cqw,2.5rem)] gap-y-[clamp(0.35rem,1.2cqh,1.875rem)]'
      }
    >
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
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-[clamp(1.25rem,4cqw,3.75rem)] pb-[clamp(1rem,2.5cqh,2rem)] pt-[clamp(0.75rem,1.8cqh,1.5rem)] animate-fadeIn">
      <div className="relative z-10 flex h-[152px] shrink-0 items-center justify-between gap-4 overflow-visible">
        <VenueTimerRing remainingSeconds={timerRemaining} totalSeconds={timerDuration} />
        <VenueLiveResponseHud stats={stats} roundType={roundType} className="shrink-0" />
        <div className="flex shrink-0 items-center gap-6">
          <VenueStatBadge kind="teams" value={teamCount} />
          <VenueStatBadge kind="points" value={pointsLabel} />
        </div>
      </div>

      <div className="relative z-0 mt-6 flex min-h-0 flex-1 flex-col gap-[clamp(0.15rem,0.45cqh,0.5rem)] overflow-hidden">
        {hasImage ? (
          <>
            <div
              className="flex w-full shrink-0 items-center justify-center overflow-hidden rounded-[20px] px-[clamp(1rem,3cqw,2.5rem)]"
              style={IMAGE_QUESTION_BAR_STYLE}
            >
              <VenueAutoFitText
                className="venue-question-text flex h-full w-full items-center justify-center text-center font-normal leading-tight text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]"
                minFontSize={32}
                maxFontSize={60}
                step={2}
              >
                {`Q${questionIndex + 1}. ${toDisplayUpper(questionText)}`}
              </VenueAutoFitText>
            </div>

            <div className="flex min-h-0 flex-1 gap-[clamp(1rem,2.5cqw,2.5rem)] overflow-hidden pt-[clamp(0.25rem,1.2cqh,1.5rem)]">
              <div
                className="h-[560px] max-h-full w-[787px] max-w-[41%] shrink-0 overflow-hidden bg-[#e1d7cf]"
                style={IMAGE_MEDIA_FRAME_STYLE}
              >
                <img src={media?.url} alt="" className="size-full " />
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-start overflow-y-auto overflow-x-hidden pr-1 pt-0">
                {renderOptions('stack')}
              </div>
            </div>
          </>
        ) : (
          <>
            <div
              className="w-full min-h-0 overflow-hidden rounded-[30px] px-[clamp(1rem,3cqw,3rem)]"
              style={{
                ...QUESTION_FRAME_STYLE,
                flex: '1 1 50%',
                maxHeight: '50%',
              }}
            >
              {hasVideo ? (
                <video
                  ref={videoRef}
                  key={media?.url}
                  src={media?.url}
                  className="size-full object-contain"
                  playsInline
                  preload="auto"
                />
              ) : (
                <VenueAutoFitText
                  className="venue-question-text flex h-full w-full items-center justify-center text-center font-normal leading-tight text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]"
                  minFontSize={28}
                  maxFontSize={56}
                  step={2}
                >
                  {`Q${questionIndex + 1}. ${toDisplayUpper(questionText)}`}
                </VenueAutoFitText>
              )}
            </div>
            {hasVideo ? <div className="shrink-0 px-1">{questionLine}</div> : null}
          </>
        )}

        {correctOrderLabel ? (
          <p className="shrink-0 text-center text-[clamp(1rem,2cqh,1.75rem)] font-extrabold uppercase text-[#38FF00]">
            {correctOrderLabel}
          </p>
        ) : null}

        {!hasImage ? (
          <div className="min-h-0 w-full shrink-0 px-[14px] pb-[10px] pt-[clamp(0.1rem,0.35cqh,0.35rem)]">
            {renderOptions('grid')}
          </div>
        ) : null}
      </div>
    </div>
  );
}
