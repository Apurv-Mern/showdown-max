import { cn, toDisplayUpper } from '@/lib/utils';
import { HeaderCapsule } from '@/components/shared/HeaderCapsule';
import { QuestionNeonFrame } from '@/components/shared/QuestionNeonFrame';

type QuestionStagePanelProps = {
  timerDisplay: string | number;
  questionIndex: number;
  totalQuestions: number;
  pointsDisplay: string | number;
  questionText: string;
  className?: string;
};

/**
 * Purple gradient question stage (timer + counter + points) with the neon-framed
 * question box — matches the player mock: HUD header on top, cyan neon box below.
 */
export function QuestionStagePanel({
  timerDisplay,
  questionIndex,
  totalQuestions,
  pointsDisplay,
  questionText,
  className,
}: QuestionStagePanelProps) {
  return (
    <div className={cn('question-stage-panel', className)}>
      <div className="question-stage-panel__blobs" aria-hidden />
      <div className="question-stage-panel__inner">
        <div className="question-stage-panel__header">
          <HeaderCapsule icon="/Clock.png" value={timerDisplay} />
          <span className="question-stage-panel__counter">
            {questionIndex + 1}/{totalQuestions}
          </span>
          <HeaderCapsule icon="/trophy.png" value={pointsDisplay} />
        </div>

        <QuestionNeonFrame className="question-stage-panel__question-frame">
          <h2 className="text-left text-[clamp(1.25rem,4.8vw,1.75rem)] font-black uppercase leading-snug text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.25)] sm:text-2xl md:text-3xl">
            {toDisplayUpper(questionText)}
          </h2>
        </QuestionNeonFrame>
      </div>
    </div>
  );
}
