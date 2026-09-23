import { cn, toDisplayUpper } from '@/lib/utils';

type QuestionStagePanelProps = {
  timerDisplay: string | number;
  questionIndex: number;
  totalQuestions: number;
  questionText: string;
  teamName?: string;
  score?: string | number;
  pointsDisplay?: string | number;
  className?: string;
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
  className,
}: QuestionStagePanelProps) {
  const scoreValue = score ?? pointsDisplay ?? '0';

  return (
    <div className={cn('flex w-full flex-col gap-5', className)}>
      <div
        className="relative flex h-[100px] w-full items-center justify-between gap-3 rounded-[8px] px-5 py-2.5"
        style={{
          background: 'linear-gradient(103deg, #00072F 0%, #00010A 100%)',
          border: '1px solid #0010FF',
          boxShadow: 'inset 0 0 10px #0010FF',
        }}
      >
        <div className="relative flex size-20 shrink-0 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, #1A00FF 30%, #000010 70%, #040040 100%)',
              boxShadow: '0 0 12px #00D9FF',
              border: '1.5px solid #00D9FF',
            }}
          />
          <span className="relative z-10 text-[35px] font-bold leading-none text-white">
            {timerDisplay}
          </span>
        </div>

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
            boxShadow: 'inset 0 0 10px #0010FF',
          }}
        >
          <p className="text-[14px] font-bold uppercase leading-none text-[#00D9FF]">SCORE</p>
          <p className="mt-1 text-[20px] font-bold uppercase leading-none text-white">{scoreValue}</p>
        </div>
      </div>

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
    </div>
  );
}
