import { cn, toDisplayUpper } from '@/lib/utils';

export type InstructionTone = 'default' | 'green' | 'red';

export type InstructionPart = {
  text: string;
  tone?: InstructionTone;
};

export type RoundIntroInstructions = {
  /** Optional headline above the +/- rows (e.g. Final Wager risk question). */
  banner?: InstructionPart[];
  positive: InstructionPart[];
  negative: InstructionPart[];
};

const GREEN = 'text-[#39ff14]';
const RED = 'text-[#ff3e3e]';
const PLAYER_GREEN = 'text-[#55f30c]';
const PLAYER_RED = 'text-[#ff0037]';

function part(text: string, tone: InstructionTone = 'default'): InstructionPart {
  return { text, tone };
}

/** Round-intro scoring copy keyed by round *type* (maps to the 7-round show format). */
export function getRoundIntroInstructions(roundType?: string): RoundIntroInstructions {
  const type = (roundType || '').toUpperCase();

  // Round 1 / 3 — Multiple Choice, Music, Final MC (+20 / −2 on the intro slide).
  if (
    type === 'MULTIPLE_CHOICE' ||
    type === 'MUSIC' ||
    type === 'FINAL_MULTIPLE_CHOICE' ||
    type === 'AUDIO_VIDEO' ||
    !type
  ) {
    return {
      positive: [
        part('Correct answer : '),
        part('20 points', 'green'),
      ],
      negative: [
        part('Incorrect answer : '),
        part('-2 points', 'red'),
      ],
    };
  }

  // Round 2 / 7 — Wager.
  if (type === 'WAGER') {
    return {
      positive: [part('Correct answer: score selected points', 'green')],
      negative: [part('Incorrect answer: lose selected points', 'red')],
    };
  }

  // Round 4 — Elimination.
  if (type === 'ELIMINATION') {
    return {
      positive: [
        part('Round starts at '),
        part('10 points', 'green'),
        part(' · increases by '),
        part('+10 points', 'green'),
        part(' for every next question'),
      ],
      negative: [
        part('Incorrect answer: '),
        part('knocked out', 'red'),
        part(' until the end of the round'),
      ],
    };
  }

  // Round 5 — Majority Rules.
  if (type === 'MAJORITY_RULES') {
    return {
      banner: [part('Most popular answer gets the points')],
      positive: [
        part('Part of the majority: '),
        part('+50 points', 'green'),
      ],
      negative: [
        part('Part of the minority: '),
        part('-50 points', 'red'),
      ],
    };
  }

  // Round 6 — Final Wager.
  if (type === 'FINAL_WAGER') {
    return {
      banner: [part('How much of our overall score are we risking?')],
      positive: [part('Correct answer: score selected bet', 'green')],
      negative: [part('Incorrect answer: lose selected bet', 'red')],
    };
  }

  // Unknown round types — same as Round 1.
  return {
    positive: [part('Correct answer : '), part('20 points', 'green')],
    negative: [part('Incorrect answer : '), part('-2 points', 'red')],
  };
}

function toneClass(
  tone: InstructionTone | undefined,
  variant: 'venue' | 'player',
  row: 'positive' | 'negative' | 'banner',
): string {
  if (tone === 'green') return variant === 'player' ? PLAYER_GREEN : GREEN;
  if (tone === 'red') return variant === 'player' ? PLAYER_RED : RED;
  if (row === 'banner') return 'text-white/90';
  return row === 'positive'
    ? variant === 'player'
      ? PLAYER_GREEN
      : GREEN
    : variant === 'player'
      ? PLAYER_RED
      : RED;
}

function toInstructionUpper(text: string): string {
  return text ? String(text).toUpperCase() : '';
}

function InstructionLine({
  parts,
  variant,
  row,
  className,
}: {
  parts: InstructionPart[];
  variant: 'venue' | 'player';
  row: 'positive' | 'negative' | 'banner';
  className?: string;
}) {
  return (
    <span className={className}>
      {parts.map((p, i) => (
        <span key={i} className={toneClass(p.tone, variant, row)}>
          {toInstructionUpper(p.text)}
        </span>
      ))}
    </span>
  );
}

export function RoundIntroScoringLines({
  roundType,
  variant,
}: {
  roundType?: string;
  variant: 'venue' | 'player';
}) {
  const instructions = getRoundIntroInstructions(roundType);
  const isVenue = variant === 'venue';

  const positiveTextClass = isVenue
    ? 'text-pretty text-[clamp(0.95rem,2.3vh,1.75rem)] font-black leading-tight wrap-anywhere drop-shadow-[0_0_8px_rgba(57,255,20,0.45)]'
    : 'min-w-0 max-w-[min(100%,22rem)] text-left text-pretty text-[clamp(0.8rem,2.8vw+0.4rem,1.35rem)] font-bold leading-snug wrap-anywhere sm:max-w-[min(100%,26rem)] sm:text-[clamp(0.85rem,1.9vw+0.35rem,1.5rem)] md:text-lg md:leading-tight lg:text-xl';

  const negativeTextClass = isVenue
    ? 'text-pretty text-[clamp(0.95rem,2.3vh,1.75rem)] font-black leading-tight wrap-anywhere drop-shadow-[0_0_8px_rgba(255,62,62,0.45)]'
    : 'min-w-0 max-w-[min(100%,22rem)] text-left text-pretty text-[clamp(0.8rem,2.8vw+0.4rem,1.35rem)] font-bold leading-snug wrap-anywhere sm:max-w-[min(100%,26rem)] sm:text-[clamp(0.85rem,1.9vw+0.35rem,1.5rem)] md:text-lg md:leading-tight lg:text-xl';

  const bannerClass = isVenue
    ? 'text-pretty text-[clamp(0.85rem,2vh,1.35rem)] font-bold uppercase leading-snug text-white/90 wrap-anywhere text-center'
    : 'mb-1 max-w-[min(100%,22rem)] text-center text-pretty text-[clamp(0.75rem,2.5vw+0.35rem,1.1rem)] font-bold uppercase leading-snug text-white/85 wrap-anywhere sm:max-w-[min(100%,26rem)]';

  const plusIconClass = isVenue
    ? 'h-[clamp(1.4rem,2.6vh,2.25rem)] w-auto shrink-0'
    : 'h-6 w-6 shrink-0 sm:h-7 sm:w-7 md:h-8 md:w-8';

  return (
    <div
      className={cn(
        'flex flex-col items-center',
        isVenue ? 'gap-2 sm:gap-3' : 'gap-2 sm:gap-2.5',
      )}
    >
      {instructions.banner?.length ? (
        <InstructionLine
          parts={instructions.banner}
          variant={variant}
          row="banner"
          className={bannerClass}
        />
      ) : null}

      <div
        className={cn(
          'flex w-full items-center justify-center',
          isVenue ? 'gap-2 sm:gap-3' : 'gap-1.5 sm:gap-2',
        )}
      >
        <img src="/plus10.png" alt="" className={plusIconClass} />
        <InstructionLine
          parts={instructions.positive}
          variant={variant}
          row="positive"
          className={positiveTextClass}
        />
      </div>

      <div
        className={cn(
          'flex w-full items-center justify-center',
          isVenue ? 'gap-2 sm:gap-3' : 'gap-1.5 sm:gap-2',
        )}
      >
        <img src="/minus2.png" alt="" className={plusIconClass} />
        <InstructionLine
          parts={instructions.negative}
          variant={variant}
          row="negative"
          className={negativeTextClass}
        />
      </div>
    </div>
  );
}

/** @deprecated Use getRoundIntroInstructions — kept for any plain-string consumers. */
export function getRoundScoringLines(roundType?: string): { positive: string; negative: string } {
  const { positive, negative } = getRoundIntroInstructions(roundType);
  const join = (parts: InstructionPart[]) => toInstructionUpper(parts.map((p) => p.text).join(''));
  return { positive: join(positive), negative: join(negative) };
}
