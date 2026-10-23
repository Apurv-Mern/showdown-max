'use client';

import type { RefObject } from 'react';
import { cn } from '@/lib/utils';
import { isQuestionImageMedia } from '@/lib/questionMedia';
import {
  HOST_DASHBOARD,
  HOST_OPTION_LETTERS,
  HOST_OPTION_TILE_STYLES,
} from '@/lib/hostDashboardTheme';

type QuestionOption = { text: string };

type HostCenterQuestionPanelProps = {
  questionIndex: number;
  totalQuestions: number;
  questionText: string;
  options: QuestionOption[];
  roundType?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  pointsForQuestion?: number;
  questionState: string;
  timerRemaining: number;
  timerDuration: number;
  revealData?: {
    correctOptionIndex: number;
    correctText: string;
    majorityOptionIndexes?: number[];
  } | null;
  resolveMediaUrl: (url?: string) => string;
  hostPreviewVideoRef?: RefObject<HTMLVideoElement | null>;
  hostVideoPlaybackActive?: boolean;
};

function HostQuestionTimerCircle({
  remainingSeconds,
  totalSeconds,
}: {
  remainingSeconds: number;
  totalSeconds: number;
}) {
  const display = Math.max(0, Math.ceil(remainingSeconds));
  const total = Math.max(1, totalSeconds);
  const ratio = Math.max(0, Math.min(1, remainingSeconds / total));
  const r = 34;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - ratio);

  return (
    <div className="relative size-[72px] shrink-0" aria-label={`${display} seconds remaining`}>
      <svg className="size-full -rotate-90" viewBox="0 0 80 80" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="#0b0f1a" stroke="#3a4458" strokeWidth="4" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="#00d9ff"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[26px] font-bold tabular-nums text-white">
        {display}
      </span>
    </div>
  );
}

/** Figma host center question card (timer top-left, text, media, option grid). */
export function HostCenterQuestionPanel({
  questionIndex,
  totalQuestions,
  questionText,
  options,
  roundType,
  mediaUrl,
  mediaType,
  pointsForQuestion,
  questionState,
  timerRemaining,
  timerDuration,
  revealData,
  resolveMediaUrl,
  hostPreviewVideoRef,
  hostVideoPlaybackActive,
}: HostCenterQuestionPanelProps) {
  const isImage = mediaUrl && isQuestionImageMedia(mediaType, mediaUrl);
  const isMp4 = mediaUrl && (mediaType || '').toLowerCase() === 'mp4';
  const isMajorityRulesRound = (roundType || '').toUpperCase() === 'MAJORITY_RULES';
  const showRevealStyling = questionState !== 'PREVIEW' && Boolean(revealData);
  const majorityOptionIndexes = new Set(revealData?.majorityOptionIndexes || []);

  return (
    <div className="mx-auto flex h-full w-full max-w-[920px] min-h-0 flex-col rounded-[5px] border border-[#888] bg-[#0b0f1a] px-5 py-5 shadow-[0_0_28px_rgba(0,0,0,0.35)]">
      <div className="relative mb-4 flex items-center gap-4">
        <HostQuestionTimerCircle remainingSeconds={timerRemaining} totalSeconds={timerDuration} />
        <p className="flex-1 text-center text-[22px] font-bold uppercase tracking-wide text-[#00d9ff]">
          Question {questionIndex + 1} of {totalQuestions}
        </p>
        {pointsForQuestion ? (
          <span className="shrink-0 text-sm font-black italic text-[#00d9ff]">
            {pointsForQuestion} PTS
          </span>
        ) : (
          <span className="w-[72px] shrink-0" aria-hidden />
        )}
      </div>

      {isImage ? (
        <>
          <div
            className="mx-auto mb-3 flex h-[clamp(12rem,32vh,22rem)] w-full max-w-[min(92%,720px)] items-center justify-center overflow-hidden rounded-[20px] shadow-[0_0_24px_rgba(0,217,255,0.35)]"
            style={{
              background: 'linear-gradient(180deg, #00072F 0%, #00010A 100%)',
              border: '3px solid #00D9FF',
            }}
          >
            <img
              src={resolveMediaUrl(mediaUrl)}
              alt=""
              className="size-full object-contain"
            />
          </div>
          <p className="mb-4 text-center text-[clamp(1.375rem,2.8vh,1.875rem)] font-bold uppercase leading-snug text-white lg:text-[clamp(1.5rem,3vh,2rem)]">
            {questionText}
          </p>
        </>
      ) : isMp4 ? (
        <>
          <div className="mx-auto mb-4 flex h-[230px] w-full max-w-[440px] items-center justify-center overflow-hidden rounded-[5px] border border-[#00d9ff] bg-black">
            <video
              ref={hostPreviewVideoRef}
              src={resolveMediaUrl(mediaUrl)}
              className="max-h-full max-w-full object-contain"
              controls={hostVideoPlaybackActive}
              autoPlay={hostVideoPlaybackActive}
            />
          </div>
          <p className="mb-4 text-center text-[clamp(1.375rem,2.8vh,1.875rem)] font-bold uppercase leading-snug text-white lg:text-[clamp(1.5rem,3vh,2rem)]">
            {questionText}
          </p>
        </>
      ) : (
        <p className="mb-4 text-center text-[clamp(1.375rem,2.8vh,1.875rem)] font-bold uppercase leading-snug text-white lg:text-[clamp(1.5rem,3vh,2rem)]">
          {questionText}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {options.map((opt, i) => {
          const isRevealedWinner = Boolean(
            showRevealStyling &&
            (isMajorityRulesRound
              ? majorityOptionIndexes.has(i)
              : revealData != null && i === revealData.correctOptionIndex),
          );
          const tile = HOST_OPTION_TILE_STYLES[i % HOST_OPTION_TILE_STYLES.length];
          const letter = HOST_OPTION_LETTERS[i] ?? String.fromCharCode(65 + i);
          return (
            <div
              key={i}
              className={cn(
                'relative flex h-20 overflow-hidden rounded-xl border-2 border-solid transition-all',
                tile.glow,
                isRevealedWinner &&
                  'z-10 scale-[1.02] border-[#38ff00] shadow-[0_0_16px_8px_rgba(56,255,0,0.55)]',
                showRevealStyling && !isRevealedWinner && 'scale-[0.98] opacity-35 grayscale',
              )}
              style={{
                borderColor: isRevealedWinner ? HOST_DASHBOARD.accentGreen : tile.border,
              }}
            >
              <div
                className={cn(
                  'flex w-[72px] shrink-0 items-center justify-center border-r border-white/20',
                  tile.letter,
                )}
              >
                <span className="text-[40px] font-black leading-none text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                  {letter}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 items-center bg-white px-3 py-2">
                <span className="line-clamp-2 w-full text-left text-[18px] font-bold uppercase leading-tight text-black lg:text-[20px]">
                  {opt.text}
                </span>
              </div>
              {isRevealedWinner ? (
                <span
                  className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full border border-white bg-[#38ff00] text-sm font-bold text-black shadow-md"
                  aria-hidden
                >
                  ✓
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {showRevealStyling && revealData && !isMajorityRulesRound ? (
        <p className="mt-5 text-center text-[18px] font-bold uppercase text-[#38ff00] lg:text-[20px]">
          Correct Answer : {revealData.correctText}
        </p>
      ) : null}
    </div>
  );
}
