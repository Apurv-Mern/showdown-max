import { toDisplayUpper } from '@/lib/utils';

function formatRoundTypeLabel(roundType?: string): string {
  const type = (roundType || '').toUpperCase();
  switch (type) {
    case 'MULTIPLE_CHOICE':
      return toDisplayUpper('Multiple Choice');
    case 'AUDIO_VIDEO':
      return toDisplayUpper('Audio/Video');
    case 'MUSIC':
      return toDisplayUpper('Music');
    case 'ELIMINATION':
      return toDisplayUpper('Elimination');
    case 'WAGER':
      return toDisplayUpper('Wager');
    case 'FINAL_WAGER':
      return toDisplayUpper('Final Wager');
    case 'MAJORITY_RULES':
      return toDisplayUpper('Majority Rules');
    case 'FINAL_MULTIPLE_CHOICE':
      return toDisplayUpper('Final Multiple Choice');
    default:
      return toDisplayUpper((roundType || 'Round').replace(/_/g, ' '));
  }
}

function normalizeRoundTitle(name?: string, roundType?: string, roundIndex?: number): string {
  const raw = (name || '').trim();
  const fallback = formatRoundTypeLabel(roundType);
  if (!raw) return toDisplayUpper(fallback || `Round ${(roundIndex || 0) + 1}`);

  const withoutPrefix = raw
    .replace(new RegExp(`^round\\s*${(roundIndex || 0) + 1}\\s*[-:–]*\\s*`, 'i'), '')
    .replace(/^round\s*\d+\s*[-:–]*\s*/i, '')
    .trim();

  if (!withoutPrefix) return toDisplayUpper(fallback || `Round ${(roundIndex || 0) + 1}`);

  const normalizedRaw = withoutPrefix.replace(/\s+/g, ' ').toLowerCase();
  const normalizedFallback = fallback.replace(/\s+/g, ' ').toLowerCase();

  if (normalizedFallback && normalizedRaw.includes(normalizedFallback)) {
    return toDisplayUpper(fallback);
  }

  return toDisplayUpper(withoutPrefix);
}

export function buildBreakUpNextLabelFromRound(
  round: { name?: string; type?: string } | null | undefined,
  roundIndex?: number,
): string | null {
  if (!round) return null;
  const title = normalizeRoundTitle(round.name, round.type, roundIndex);
  return `MUCH BELOVED ${title} UP NEXT`;
}

/** Cyan subline under the break title — e.g. "MUCH BELOVED MUSIC ROUND UP NEXT". */
export function resolveBreakUpNextLabel(
  rounds: Array<{ name?: string; type?: string }> | null | undefined,
  currentRoundIndex: number | null | undefined,
): string | null {
  if (!Array.isArray(rounds) || rounds.length === 0) return null;
  const idx = Math.max(0, Number(currentRoundIndex ?? 0));
  const nextRound = rounds[idx + 1];
  return buildBreakUpNextLabelFromRound(nextRound, idx + 1);
}

export function resolveBreakUpNextLabelFromBreakStart(data: {
  upNextRound?: { name?: string; type?: string; index?: number } | null;
  rounds?: Array<{ name?: string; type?: string }> | null;
  currentRoundIndex?: number | null;
}): string | null {
  const fromPayload = buildBreakUpNextLabelFromRound(
    data.upNextRound ?? null,
    data.upNextRound?.index,
  );
  if (fromPayload) return fromPayload;
  return resolveBreakUpNextLabel(data.rounds, data.currentRoundIndex);
}
