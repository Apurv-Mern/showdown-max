export const DEFAULT_KANGAROO_NAMES = [
  'Too Hot To Hop',
  "Who's Your Daddy",
  'Chunder From Downunder',
  'Geespot',
  'The Hopfather',
  'Hoppy Gilmore',
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

export function resolveKangarooNames(names: string[] | null | undefined): string[] {
  if (!Array.isArray(names) || names.length < 6) {
    return defaultKangarooNames();
  }
  const trimmed = names.slice(0, 6).map((name) => String(name || '').trim());
  return trimmed.map((name, idx) => name || DEFAULT_KANGAROO_NAMES[idx]);
}
