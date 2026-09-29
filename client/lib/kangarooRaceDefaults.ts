export const DEFAULT_KANGAROO_NAMES = [
  'Hopportunity Knocks',
  'Kanga-Rooted',
  'Barry McBounced',
  'Captain Wobblepouch',
  'Hoprah Winfree',
  'Skippy Longstocking',
] as const;

const LEGACY_DEFAULT_KANGAROO_NAMES = [
  'Blue Bolt',
  'Orange Flash',
  'Green Dash',
  'Golden Hop',
  'Purple Rocket',
  'Red Thunder',
] as const;

export function defaultKangarooNames(): string[] {
  return [...DEFAULT_KANGAROO_NAMES];
}

/** Unity lineup badge: `"18/25"` (selected / roster). */
export function formatKangarooTeamResponse(selected: number, total: number): string {
  const picked = Math.max(0, Math.trunc(Number(selected) || 0));
  const roster = Math.max(picked, Math.trunc(Number(total) || 0));
  return `${picked}/${roster}`;
}

/** Unity bib 1–6 to force a winner. `0` or omit = random. */
export function normalizeWinnerKangaroo(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const t = Math.trunc(n);
  return t >= 1 && t <= 6 ? t : 0;
}

/** Replace stored legacy defaults (pre-rename) with the current defaults. */
export function resolveKangarooNames(names: string[] | null | undefined): string[] {
  if (!Array.isArray(names) || names.length < 6) {
    return defaultKangarooNames();
  }
  const trimmed = names.slice(0, 6).map((name) => String(name || '').trim());
  const isLegacy = LEGACY_DEFAULT_KANGAROO_NAMES.every((legacy, idx) => trimmed[idx] === legacy);
  if (isLegacy) {
    return defaultKangarooNames();
  }
  return trimmed.map((name, idx) => name || DEFAULT_KANGAROO_NAMES[idx]);
}
