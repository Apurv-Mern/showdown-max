/**
 * Player/venue-safe question fields (no correct answers or ordering keys exposed).
 */
const isOrderingQuestion = (options = []) =>
  (options || []).some(
    (o) => o != null && o.correctOrder !== undefined && o.correctOrder !== null,
  );

const mapClientQuestionPayload = (question) => {
  if (!question) return null;
  const options = question.options || [];
  return {
    id: question.id,
    text: question.text,
    options: options.map((o) => ({ text: o.text })),
    mediaUrl: question.mediaUrl,
    mediaType: question.mediaType,
    category: question.category || null,
    isOrdering: isOrderingQuestion(options),
  };
};

module.exports = { isOrderingQuestion, mapClientQuestionPayload };
