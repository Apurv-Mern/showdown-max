import { normalizeRoundIntroTitle } from '@/lib/roundDisplayLabels';

export function buildBreakUpNextLabelFromRound(
  round: { name?: string; type?: string } | null | undefined,
  roundIndex?: number,
): string | null {
  if (!round) return null;
  const title = normalizeRoundIntroTitle(round.name, round.type, roundIndex);
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
