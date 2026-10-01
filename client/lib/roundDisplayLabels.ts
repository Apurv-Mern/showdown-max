import { toDisplayUpper } from '@/lib/utils';

/** Sentence-case label for a round type (intro subtitles, host copy). */
export function formatRoundTypeLabel(roundType?: string): string {
  const type = (roundType || '').toUpperCase();
  switch (type) {
    case 'MULTIPLE_CHOICE':
      return 'Multiple Choice';
    case 'AUDIO_VIDEO':
      return 'Audio/Video';
    case 'MUSIC':
      return 'Music Round';
    case 'ELIMINATION':
      return 'Elimination Round';
    case 'WAGER':
      return 'Power Play';
    case 'FINAL_WAGER':
      return 'Final Wager';
    case 'MAJORITY_RULES':
      return 'Majority Rules';
    case 'FINAL_MULTIPLE_CHOICE':
      return 'Final Multiple Choice';
    default:
      return (roundType || 'Round')
        .split('_')
        .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(' ');
  }
}

export function formatRoundTypeDisplayLabel(roundType?: string): string {
  return toDisplayUpper(formatRoundTypeLabel(roundType));
}

const GENERIC_ROUND_NAME = /^round\s*\d+\s*$/i;

/** Default admin round names → use branded type label (Power Play, Music Round, …). */
const LEGACY_ROUND_NAME_FOR_TYPE: Record<string, RegExp> = {
  WAGER: /^wager(\s+round)?$/i,
  MUSIC: /^music(\s+round)?$/i,
  ELIMINATION: /^elimination(\s+round)?$/i,
  MAJORITY_RULES: /^majority(\s+rules)?(\s+round)?$/i,
};

function shouldUseBrandedTypeLabel(withoutPrefix: string, roundType?: string): boolean {
  const type = (roundType || '').toUpperCase();
  if (!type) return false;
  const raw = withoutPrefix.trim();
  if (!raw || GENERIC_ROUND_NAME.test(raw)) return true;
  const pattern = LEGACY_ROUND_NAME_FOR_TYPE[type];
  return pattern ? pattern.test(raw) : false;
}

/** Host lines like "Up next: Power Play Round" without doubling "Round". */
export function formatRoundTypeWithRoundSuffix(roundType?: string): string {
  const label = formatRoundTypeLabel(roundType);
  if (/\bround\b/i.test(label)) return label;
  return `${label} Round`;
}

/** Host primary action, e.g. START POWER PLAY / START MUSIC ROUND. */
export function formatRoundTypeStartButtonLabel(roundType?: string): string {
  const label = formatRoundTypeLabel(roundType);
  if (/\bround\b/i.test(label)) {
    return `START ${toDisplayUpper(label)}`;
  }
  return `START ${toDisplayUpper(label)} ROUND`;
}

export function normalizeRoundIntroTitle(
  name?: string,
  roundType?: string,
  roundIndex?: number,
): string {
  if ((roundType || '').toUpperCase() === 'FINAL_WAGER') {
    return toDisplayUpper('FINAL QUESTION');
  }
  const raw = (name || '').trim();
  const fallback = formatRoundTypeDisplayLabel(roundType);
  const roundNumberFallback = toDisplayUpper(`Round ${(roundIndex ?? 0) + 1}`);

  if (!raw) return fallback || roundNumberFallback;

  const withoutPrefix = raw
    .replace(new RegExp(`^round\\s*${(roundIndex ?? 0) + 1}\\s*[-:–]*\\s*`, 'i'), '')
    .replace(/^round\s*\d+\s*[-:–]*\s*/i, '')
    .trim();

  if (shouldUseBrandedTypeLabel(withoutPrefix, roundType)) {
    return fallback || roundNumberFallback;
  }

  const normalizedRaw = withoutPrefix.replace(/\s+/g, ' ').toLowerCase();
  const normalizedFallback = fallback.replace(/\s+/g, ' ').toLowerCase();

  if (
    normalizedFallback &&
    (normalizedRaw.includes(normalizedFallback) || normalizedFallback.includes(normalizedRaw))
  ) {
    return fallback;
  }

  return toDisplayUpper(withoutPrefix);
}
