const KANGAROO_SLOT_COUNT = 6;
const KANGAROO_NAME_MAX_LENGTH = 32;
const KANGAROO_POINTS_BY_RANK = Object.freeze([50, 40, 30, 20, 10, 0]);
const DEFAULT_KANGAROO_NAMES = Object.freeze([
  'Hopportunity Knocks',
  'Kanga-Rooted',
  'Barry McBounced',
  'Captain Wobblepouch',
  'Hoprah Winfree',
  'Skippy Longstocking',
]);
const LEGACY_DEFAULT_KANGAROO_NAMES = Object.freeze([
  'Blue Bolt',
  'Orange Flash',
  'Green Dash',
  'Golden Hop',
  'Purple Rocket',
  'Red Thunder',
]);

const isLegacyKangarooNames = (names) => {
  if (!Array.isArray(names) || names.length < KANGAROO_SLOT_COUNT) return false;
  return LEGACY_DEFAULT_KANGAROO_NAMES.every(
    (legacy, idx) => String(names[idx] || '').trim() === legacy,
  );
};

const resolveKangarooNamesInput = (input) => {
  if (isLegacyKangarooNames(input)) return [...DEFAULT_KANGAROO_NAMES];
  return input;
};

module.exports = {
  KANGAROO_SLOT_COUNT,
  KANGAROO_NAME_MAX_LENGTH,
  KANGAROO_POINTS_BY_RANK,
  DEFAULT_KANGAROO_NAMES,
  LEGACY_DEFAULT_KANGAROO_NAMES,
  isLegacyKangarooNames,
  resolveKangarooNamesInput,
};
