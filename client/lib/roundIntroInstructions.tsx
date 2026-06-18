import { cn, toDisplayUpper } from '@/lib/utils';

export type InstructionTone = 'default' | 'green' | 'red';

export type InstructionPart = {
  text: string;
  tone?: InstructionTone;
};

export type RoundIntroInstructions = {
  /** Optional headline above the +/- rows (e.g. Final Wager risk question). */
  banner?: InstructionPart[];
  /** Multi-line banner when a single `banner` string wraps poorly in the intro box. */
  bannerLines?: InstructionPart[][];
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
      positive: [part('Correct answer : '), part('score selected points', 'green')],
      negative: [part('Incorrect answer : '), part('lose selected points', 'red')],
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
        part('knocked out', 'default'),
        part(' until the end of the round'),
      ],
      positiveLines: [
        [part('Round starts at '), part('10 points', 'green')],
        [part('Increases by '), part('+10 points', 'green'), part(' for every')],
        [part('next question')],
      ],
      negativeLines: [
        [part('Incorrect answer : '), part('knocked out')],
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
      bannerLines: [[part('How much of our overall')], [part('score are we risking?')]],
      positive: [part('Correct answer : '), part('score selected bet', 'green')],
      negative: [part('Incorrect answer : '), part('lose selected bet', 'red')],
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
  const isWide = variant === 'venue' || variant === 'host';
  if (tone === 'green') {
    return cn(
      variant === 'player' ? PLAYER_GREEN : GREEN,
      isWide && 'drop-shadow-[0_0_8px_rgba(57,255,20,0.45)]',
    );
  }
  if (tone === 'red') {
    return cn(
      variant === 'player' ? PLAYER_RED : RED,
      isWide && 'drop-shadow-[0_0_8px_rgba(255,62,62,0.45)]',
    );
  }
  if (row === 'banner') return 'text-white/90';
  return 'text-white';
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
  playerWagerRound = false,
}: {
  lines: InstructionPart[][];
  iconSrc: string;
  variant: RoundIntroVariant;
  row: 'positive' | 'negative';
  density: RoundIntroInstructions['density'];
  playerWagerRound?: boolean;
}) {
  const isPlayer = variant === 'player';
  const isWide = variant === 'venue' || variant === 'host';
  const isLargeVenue = variant === 'venue';
  const isCompact = density === 'compact';
  const isRelaxed = density === 'relaxed';

  const lineTextClass = cn(
    'block w-full text-center text-pretty font-bold leading-[1.12] wrap-anywhere',
    isPlayer
      ? playerWagerRound
        ? 'text-[clamp(0.5rem,1.9vw+0.12rem,0.75rem)] sm:text-[clamp(0.52rem,1.35vw+0.15rem,0.8rem)]'
        : isRelaxed
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
  const isHost = variant === 'host';
  const isWide = variant === 'venue' || variant === 'host';
  const isLargeVenue = variant === 'venue';
  const density = instructions.density ?? 'normal';
  const rt = (roundType || '').toUpperCase();
  const isFinalWager = rt === 'FINAL_WAGER';
  const isPlayerWagerRound = isPlayer && (rt === 'WAGER' || rt === 'FINAL_WAGER');
  /** Final Wager uses compact typography on host only — venue keeps normal sizing. */
  const effectiveDensity =
    isPlayerWagerRound || (isFinalWager && density === 'compact' && !isHost)
      ? isPlayerWagerRound
        ? 'compact'
        : 'normal'
      : density;
  const isCompact = effectiveDensity === 'compact';
  const isRelaxed = effectiveDensity === 'relaxed';

  const bannerClass = isPlayer
    ? cn(
        'block w-full text-pretty text-center font-bold uppercase leading-[1.15] text-white/85 wrap-anywhere',
        isPlayerWagerRound
          ? 'text-[clamp(0.48rem,1.85vw+0.1rem,0.72rem)]'
          : isRelaxed
            ? 'text-[clamp(0.62rem,2.5vw+0.2rem,0.92rem)] sm:text-[clamp(0.68rem,2vw+0.25rem,1rem)]'
            : isCompact
              ? 'text-[clamp(0.55rem,2.2vw+0.15rem,0.82rem)]'
              : 'text-[clamp(0.65rem,2.4vw+0.2rem,0.9rem)]',
      )
    : cn(
        'block w-full text-pretty text-center font-bold uppercase leading-[1.15] text-white/90 wrap-anywhere',
        isLargeVenue
          ? isRelaxed
            ? 'text-[clamp(0.95rem,2.2vh,1.35rem)]'
            : isCompact
              ? 'text-[clamp(0.78rem,1.75vh,1.05rem)]'
              : 'text-[clamp(1rem,2.35vh,1.5rem)]'
          : isRelaxed
            ? 'text-[clamp(0.75rem,1.65vh,1.08rem)]'
            : isCompact
              ? 'text-[clamp(0.62rem,1.35vh,0.88rem)]'
              : 'text-[clamp(0.8rem,1.85vh,1.2rem)]',
      );

  const bannerLines = instructions.bannerLines?.length
    ? instructions.bannerLines
    : instructions.banner?.length
      ? [instructions.banner]
      : [];

  const positiveLines = resolveLines(instructions.positiveLines, instructions.positive);
  const negativeLines = resolveLines(instructions.negativeLines, instructions.negative);

  const blockGap = isPlayerWagerRound
    ? 'gap-1 sm:gap-1.5'
    : isRelaxed
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
        isPlayer && 'mt-[15px]',
      )}
    >
      {bannerLines.length ? (
        <div
          className={cn(
            'flex w-full flex-col items-center',
            isCompact ? 'gap-px sm:gap-0.5' : 'gap-0.5 sm:gap-1',
          )}
        >
          {bannerLines.map((lineParts, lineIdx) => (
            <InstructionLine
              key={`banner-${lineIdx}`}
              parts={lineParts}
              variant={variant}
              row="banner"
              className={bannerClass}
            />
          ))}
        </div>
      ) : null}

      <InstructionBlock
        lines={positiveLines}
        iconSrc="/plus10.png"
        variant={variant}
        row="positive"
        density={effectiveDensity}
        playerWagerRound={isPlayerWagerRound}
      />

      <InstructionBlock
        lines={negativeLines}
        iconSrc="/minus2.png"
        variant={variant}
        row="negative"
        density={effectiveDensity}
        playerWagerRound={isPlayerWagerRound}
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
