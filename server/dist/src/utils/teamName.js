/**
 * Normalize team names for duplicate detection:
 * - trim
 * - collapse internal whitespace
 * - lowercase
 * @param {string} name
 * @returns {string}
 */
const normalizeTeamName = (name) => {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

/**
 * Sanitize team name for storage/display:
 * - trim
 * - collapse internal whitespace
 * @param {string} name
 * @returns {string}
 */
const sanitizeTeamName = (name) => {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
};

module.exports = {
  normalizeTeamName,
  sanitizeTeamName,
};
