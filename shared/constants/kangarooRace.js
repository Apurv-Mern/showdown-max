const KANGAROO_SLOT_COUNT = 6;
const KANGAROO_NAME_MAX_LENGTH = 32;
const KANGAROO_POINTS_BY_RANK = Object.freeze([50, 40, 30, 20, 10, 0]);
const DEFAULT_KANGAROO_NAMES = Object.freeze([
  'Blue Bolt',
  'Orange Flash',
  'Green Dash',
  'Golden Hop',
  'Purple Rocket',
  'Red Thunder',
]);

module.exports = {
  KANGAROO_SLOT_COUNT,
  KANGAROO_NAME_MAX_LENGTH,
  KANGAROO_POINTS_BY_RANK,
  DEFAULT_KANGAROO_NAMES,
};
