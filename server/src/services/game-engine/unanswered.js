/**
 * True when a team did not lock a valid answer (skip, timeout, or missing).
 * Ordering questions require a non-empty option-index array.
 * @param {object|null|undefined} response
 * @param {object} [question]
 */
const isUnanswered = (response, question) => {
  if (!response) return true;
  const isOrdering = Array.isArray(question?.options)
    ? question.options.some((o) => o && o.correctOrder !== undefined)
    : false;
  const selected = response.selectedOptionIndex;
  if (isOrdering) {
    return !Array.isArray(selected) || selected.length === 0;
  }
  if (selected === undefined || selected === null) return true;
  if (Array.isArray(selected)) return selected.length === 0;
  return Number(selected) < 0 || !Number.isFinite(Number(selected));
};

module.exports = { isUnanswered };
