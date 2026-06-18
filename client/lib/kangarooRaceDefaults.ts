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
