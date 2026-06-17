import { cn, toDisplayUpper } from '@/lib/utils';

export type InstructionTone = 'default' | 'green' | 'red';

export type InstructionPart = {
  text: string;
  tone?: InstructionTone;
};

export type RoundIntroInstructions = {
  /** Optional headline above the +/- rows (e.g. Final Wager risk question). */
  banner?: InstructionPart[];
  /** Single-line fallback when `positiveLines` is omitted. */
  positive: InstructionPart[];
  /** Single-line fallback when `negativeLines` is omitted. */
  negative: InstructionPart[];
  /** Explicit line breaks so long copy stays inside the intro PNG box. */
  positiveLines?: InstructionPart[][];
  negativeLines?: InstructionPart[][];
  /** Tighter typography for multi-line rounds; `relaxed` = single-block rounds with a slight size boost. */
  density?: 'normal' | 'compact' | 'relaxed';
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

  if (
    type === 'MULTIPLE_CHOICE' ||
    type === 'MUSIC' ||
    type === 'FINAL_MULTIPLE_CHOICE' ||
    type === 'AUDIO_VIDEO' ||
    !type
  ) {
    return {
      positive: [part('Correct answer : '), part('20 points', 'green')],
      negative: [part('Incorrect answer : '), part('-2 points', 'red')],
    };
  }

  if (type === 'WAGER') {
    return {
      positive: [part('Correct answer : score selected points', 'green')],
      negative: [part('Incorrect answer : lose selected points', 'red')],
      positiveLines: [[part('Correct answer :')], [part('score selected points', 'green')]],
      negativeLines: [[part('Incorrect answer :')], [part('lose selected points', 'red')]],
    };
  }

  if (type === 'ELIMINATION') {
    return {
      density: 'compact',
      positive: [
        part('Round starts at '),
        part('10 points', 'green'),
        part(' · increases by '),
        part('+10 points', 'green'),
        part(' for every next question'),
      ],
      negative: [
        part('Incorrect answer : '),
        part('knocked out', 'red'),
        part(' until the end of the round'),
      ],
      positiveLines: [
        [part('Round starts at '), part('10 points', 'green')],
        [part('Increases by '), part('+10 points', 'green'), part(' for every')],
        [part('next question')],
      ],
      negativeLines: [
        [part('Incorrect answer : '), part('knocked out', 'red')],
        [part('until the end of the round')],
      ],
    };
  }

  if (type === 'MAJORITY_RULES') {
    return {
      density: 'relaxed',
      banner: [part('Most popular answer gets the points')],
      positive: [part('Part of the majority : '), part('+50 points', 'green')],
      negative: [part('Part of the minority : '), part('-50 points', 'red')],
    };
  }

  if (type === 'FINAL_WAGER') {
    return {
      density: 'compact',
      banner: [part('How much of our overall score are we risking?')],
      positive: [part('Correct answer : score selected bet', 'green')],
      negative: [part('Incorrect answer : lose selected bet', 'red')],
      positiveLines: [[part('Correct answer :')], [part('score selected bet', 'green')]],
      negativeLines: [[part('Incorrect answer :')], [part('lose selected bet', 'red')]],
    };
  }

  return {
    positive: [part('Correct answer : '), part('20 points', 'green')],
    negative: [part('Incorrect answer : '), part('-2 points', 'red')],
  };
}

export type RoundIntroVariant = 'player' | 'venue' | 'host';

function toneClass(
  tone: InstructionTone | undefined,
  variant: RoundIntroVariant,
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
  variant: RoundIntroVariant;
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

function resolveLines(
  explicit: InstructionPart[][] | undefined,
  fallback: InstructionPart[],
): InstructionPart[][] {
  if (explicit?.length) return explicit;
  return [fallback];
}

function InstructionBlock({
  lines,
  iconSrc,
  variant,
  row,
  density,
}: {
  lines: InstructionPart[][];
  iconSrc: string;
  variant: RoundIntroVariant;
  row: 'positive' | 'negative';
  density: RoundIntroInstructions['density'];
}) {
  const isPlayer = variant === 'player';
  const isWide = variant === 'venue' || variant === 'host';
  const isLargeVenue = variant === 'venue';
  const isCompact = density === 'compact';
  const isRelaxed = density === 'relaxed';

  const lineTextClass = cn(
    'block w-full text-center text-pretty font-bold leading-[1.12] wrap-anywhere',
    isPlayer
      ? isRelaxed
        ? 'text-[clamp(0.68rem,2.9vw+0.25rem,1.05rem)] sm:text-[clamp(0.75rem,2vw+0.35rem,1.18rem)]'
        : isCompact
          ? 'text-[clamp(0.58rem,2.4vw+0.2rem,0.92rem)] sm:text-[clamp(0.62rem,1.6vw+0.25rem,1rem)]'
          : 'text-[clamp(0.72rem,2.6vw+0.3rem,1.15rem)] sm:text-[clamp(0.8rem,1.8vw+0.3rem,1.3rem)]'
      : isLargeVenue
        ? isRelaxed
          ? 'text-[clamp(1.05rem,2.65vh,1.8rem)] font-black'
          : isCompact
            ? 'text-[clamp(0.95rem,2.45vh,1.75rem)] font-black'
            : 'text-[clamp(1.1rem,2.85vh,2.05rem)] font-black'
        : isRelaxed
          ? 'text-[clamp(0.82rem,1.9vh,1.38rem)] font-black'
          : isCompact
            ? 'text-[clamp(0.72rem,1.65vh,1.2rem)] font-black'
            : 'text-[clamp(0.9rem,2.1vh,1.55rem)] font-black',
    isWide && row === 'positive' && 'drop-shadow-[0_0_8px_rgba(57,255,20,0.45)]',
    isWide && row === 'negative' && 'drop-shadow-[0_0_8px_rgba(255,62,62,0.45)]',
  );

  const lineGap =
    isRelaxed && isWide
      ? 'gap-1 sm:gap-1.5'
      : isCompact
        ? isWide
          ? 'gap-0.5'
          : 'gap-px sm:gap-0.5'
        : isWide
          ? 'gap-1'
          : 'gap-0.5 sm:gap-1';
  const sidePad = 'px-2 sm:px-3';

  return (
    <div className="relative w-full">
      {/* Lightning icons hidden — text-only instructions on player, venue, and host */}
      {/* <img
        src={iconSrc}
        alt=""
        className={cn('pointer-events-none absolute left-0 top-[0.15em]', iconClass)}
      /> */}
      <div className={cn('flex w-full flex-col items-center', sidePad, lineGap)}>
        {lines.map((lineParts, lineIdx) => (
          <InstructionLine
            key={`${row}-${lineIdx}`}
            parts={lineParts}
            variant={variant}
            row={row}
            className={lineTextClass}
          />
        ))}
      </div>
    </div>
  );
}

export function RoundIntroScoringLines({
  roundType,
  variant,
}: {
  roundType?: string;
  variant: RoundIntroVariant;
}) {
  const instructions = getRoundIntroInstructions(roundType);
  const isPlayer = variant === 'player';
  const isWide = variant === 'venue' || variant === 'host';
  const isLargeVenue = variant === 'venue';
  const density = instructions.density ?? 'normal';
  const isCompact = density === 'compact';
  const isRelaxed = density === 'relaxed';

  const bannerClass = isPlayer
    ? cn(
        'w-full text-pretty text-center font-bold uppercase leading-snug text-white/85 wrap-anywhere',
        isRelaxed
          ? 'text-[clamp(0.62rem,2.5vw+0.2rem,0.92rem)] sm:text-[clamp(0.68rem,2vw+0.25rem,1rem)]'
          : isCompact
            ? 'text-[clamp(0.55rem,2.2vw+0.15rem,0.82rem)]'
            : 'text-[clamp(0.65rem,2.4vw+0.2rem,0.9rem)]',
      )
    : cn(
        'w-full text-pretty text-center font-bold uppercase leading-snug text-white/90 wrap-anywhere',
        isLargeVenue
          ? isRelaxed
            ? 'text-[clamp(0.95rem,2.2vh,1.35rem)]'
            : isCompact
              ? 'text-[clamp(0.85rem,2vh,1.2rem)]'
              : 'text-[clamp(1rem,2.35vh,1.5rem)]'
          : isRelaxed
            ? 'text-[clamp(0.75rem,1.65vh,1.08rem)]'
            : isCompact
              ? 'text-[clamp(0.65rem,1.45vh,0.95rem)]'
              : 'text-[clamp(0.8rem,1.85vh,1.2rem)]',
      );

  const positiveLines = resolveLines(instructions.positiveLines, instructions.positive);
  const negativeLines = resolveLines(instructions.negativeLines, instructions.negative);

  const blockGap = isRelaxed
    ? isWide
      ? 'gap-2 sm:gap-2.5'
      : 'gap-1.5 sm:gap-2'
    : isCompact
      ? isWide
        ? 'gap-1.5 sm:gap-2'
        : 'gap-1 sm:gap-1.5'
      : isWide
        ? 'gap-2 sm:gap-2.5'
        : 'gap-1.5 sm:gap-2';

  return (
    <div
      className={cn(
        'flex w-full max-w-full flex-col items-stretch',
        blockGap,
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

      <InstructionBlock
        lines={positiveLines}
        iconSrc="/plus10.png"
        variant={variant}
        row="positive"
        density={density}
      />

      <InstructionBlock
        lines={negativeLines}
        iconSrc="/minus2.png"
        variant={variant}
        row="negative"
        density={density}
      />
    </div>
  );
}

/** @deprecated Use getRoundIntroInstructions — kept for any plain-string consumers. */
export function getRoundScoringLines(roundType?: string): { positive: string; negative: string } {
  const { positive, negative, positiveLines, negativeLines } = getRoundIntroInstructions(roundType);
  const joinParts = (parts: InstructionPart[]) =>
    toInstructionUpper(parts.map((p) => p.text).join(''));
  const joinBlock = (lines: InstructionPart[][] | undefined, fallback: InstructionPart[]) => {
    const rows = resolveLines(lines, fallback);
    return rows.map((row) => joinParts(row)).join(' ');
  };
  return {
    positive: joinBlock(positiveLines, positive),
    negative: joinBlock(negativeLines, negative),
  };
}
