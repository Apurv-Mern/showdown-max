import { cn } from '@/lib/utils';

type QuestionNeonFrameProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Futuristic neon-framed question panel (venue-style HUD) for the player app.
 */
export function QuestionNeonFrame({ children, className }: QuestionNeonFrameProps) {
  return (
    <div className={cn('question-neon-frame', className)}>
      <span className="question-neon-frame__corner question-neon-frame__corner--tl" aria-hidden />
      <span className="question-neon-frame__corner question-neon-frame__corner--tr" aria-hidden />
      <span className="question-neon-frame__corner question-neon-frame__corner--bl" aria-hidden />
      <span className="question-neon-frame__corner question-neon-frame__corner--br" aria-hidden />
      <span className="question-neon-frame__tick question-neon-frame__tick--top" aria-hidden />
      <span className="question-neon-frame__tick question-neon-frame__tick--bottom" aria-hidden />
      <span className="question-neon-frame__tick question-neon-frame__tick--left" aria-hidden />
      <span className="question-neon-frame__tick question-neon-frame__tick--right" aria-hidden />
      <div className="question-neon-frame__content">{children}</div>
    </div>
  );
}
